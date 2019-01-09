import * as cli from 'cli-color';
import * as limiter from 'rolling-rate-limiter';
import * as redis from 'redis';
import * as request from 'request';
import * as tmi from 'tmi.js';

import {Log} from '../log';
import {Messaging} from '../messaging';
import {MikuiaService} from './mikuiaService';
import {Models} from '../models';
import {Settings} from '../settings'
import {Target} from '../target';
import {Tools} from '../tools';

import {TwitchGetLiveStreamsResponse} from '../responses/twitchGetLiveStreamsResponse';

const MAX_JOIN_INTERVAL = 15;
const MAX_JOIN_IN_INTERVAL = 49;

export class TwitchService extends MikuiaService {
	private channelClients = {};
	private channelsJoined: Array<string> = [];
	private connectionChannels = {};
	private connections = {};
	private idMappings = {}; // name -> id
	private nameMappings = {}; // id -> name
	private nextJoinClient = 0;

	private joinLimiter = limiter({
		interval: MAX_JOIN_INTERVAL * 1000,
		maxInInterval: MAX_JOIN_IN_INTERVAL,
		namespace: 'service:twitch:limiter:join',
		redis: this.db
	})

	private updatingChannels = false;

	async connect() {
		for(let id of [...Array(this.settings.services.twitch.connections).keys()]) {
			this.connections[id] = await this.spawnConnection(id); 
		}
	}

	getChannel(serviceId: string) {
		return this.models.getTarget('twitch', serviceId);
	}

	async handleTwitchMessage(userstate: any, channel: string, message: string) {
		this.msg.broadcast('service:twitch:chat:message', {
			user: userstate,
			channel: channel,
			message: message
		});

		var Channel = this.getChannel(this.idMappings[channel]);
		this.handleMessage(Channel, message, {
			user: userstate
		});
	}

	handleResponse(event: any, data: any) {
		var serviceId = event.service.serviceId;
		var Channel = this.getChannel(serviceId);

		this.say(Channel, data.message, event.service.meta);
	}

	async join(target: Target) {
		return new Promise(async (resolve) => {
			if(target.service == 'twitch') {
				var name = this.nameMappings[target.serviceId];
				if(this.channelsJoined.indexOf('#' + name) == -1) {
					/*	Uhhh, I think this deserves an explanation.
						I don't have one.
						This has been working for like a year or so, it's probably fine. */

					var limitEntries = await this.db.zrangebyscoreAsync('service:twitch:limiter:join', '-inf', '+inf', 'withscores');
					var currentTime = (new Date).getTime() * 1000;
					var remainingRequests = MAX_JOIN_IN_INTERVAL;

					for(let limitEntry of limitEntries) {
						if(parseInt(limitEntry) + MAX_JOIN_INTERVAL * 1000 * 1000 > currentTime) {
							remainingRequests--;
						}
					}

					if(remainingRequests > 0) {
						this.joinLimiter('', (err, timeLeft) => {
							if(!timeLeft) {

								if(this.nextJoinClient >= this.settings.services.twitch.connections) {
									this.nextJoinClient = 0;
								}

								this.connections[this.nextJoinClient].join(name).then(() => {
									resolve();
								}).catch((err) => {
									Log.error('Twitch', 'Failed to join channel: ' + cli.yellowBright('#' + name) + '.');
									console.log(err);
									resolve(err);
								})
							} else {
								resolve(true);
							}
						})
					} else {
						resolve(true);
					}
				} else {
					resolve(true);
				}
			} else {
				resolve(true);
			}
		});
	}

	async parseChunk(chunk): Promise<TwitchGetLiveStreamsResponse> {
		return new Promise<TwitchGetLiveStreamsResponse>((resolve) => {
			request({
				url: 'https://api.twitch.tv/kraken/streams/?channel=' + chunk.join(',') + '&client_id=' + this.settings.services.twitch.clientId + '&api_version=5'
			}, (err, res, body) => {
				if(!err && res.statusCode == 200) {
					resolve(JSON.parse(body));
				} else {
					Log.error('Twitch', 'Channel check request failed. Resolving with an empty array.');
					console.log(err);
					resolve({
						_total: 0,
						streams: []
					});
				}
			})
		})
	}

	async parseNextQueueMessage() {
		return new Promise(async (resolve, reject) => {
			var entry = await this.db.lpopAsync('service:twitch:queue:chat');
			if(entry) {
				var data = JSON.parse(entry);

				// TODO: rate limiting
				if(this.channelsJoined.indexOf(data.channel) > -1) {
					this.connections[this.channelClients[data.channel]].say(data.channel, data.message);
					setTimeout(resolve, 10);
				} else {
					setTimeout(resolve, 10);
					// TODO: put it back? xd
				}
			} else {
				setTimeout(resolve, 100);
			}
		});
	}

	say(target: Target, message: string, meta: object) {
		var channel = this.nameMappings[target.serviceId];
		
		if(channel.indexOf('#') == -1) {
			channel = '#' + channel;
		}

		if(this.channelsJoined.indexOf(channel) == -1) return;

		if(message.indexOf('.') == 0 || message.indexOf('/') == 0) {
			message = '!' + message.replace('.', '').replace('/', '');
		}

		this.sayUnfiltered(channel, message);
	}

	sayUnfiltered(channel: string, message: string) {
		// TODO: rate limiters
		var lines = message.split('\\n');
		for(let line of lines) {
			if(line.trim() != '') {
				var entry = JSON.stringify({
					channel: channel,
					message: line
				});
				
				this.db.rpushAsync('service:twitch:queue:chat', entry);
			}
		}
	}

	spawnConnection(id: number) {
		var self = this;
		return new Promise((resolve) => {
			var logHeader = '[' + cli.cyanBright(id) + ']';

			var client = new tmi.client({
				options: {
					clientId: this.settings.services.twitch.clientId,
					debug: false
				},
				connection: {
					reconnect: true
				},
				identity: {
					username: this.settings.services.twitch.username,
					password: this.settings.services.twitch.oauth
				}
			})

			client.id = id;
			client.connect();

			this.connectionChannels[client.id] = [];

			client.on('connected', (address: string, port: number) => {
				Log.info('Twitch', logHeader + ' Connected to ' + cli.yellowBright(address + ':' + port) + '.');
				resolve(client);
			})

			client.on('disconnected', (reason: string) => {
				Log.error('Twitch', logHeader + ' Disconnected.');
				console.log(reason);

				// TODO: clear this.connectionChannels & join the channels back
			})

			client.on('join', (channel: string, username: string) => {
				if(username == this.settings.services.twitch.username.toLowerCase()) {
					Log.info('Twitch', logHeader + ' Joined channel: ' + cli.yellowBright(channel) + '.');

					this.channelsJoined.push(channel);
					this.connectionChannels[client.id].push(channel);
					this.channelClients[channel] = client.id;
					this.nextJoinClient++;
				}
			})

			client.on('message', (channel: string, userstate: any, message: string, self: boolean) => {
				if(!self) {
					this.handleTwitchMessage(userstate, channel, message);
				}

				if(self || message.toLowerCase().indexOf(this.settings.services.twitch.username.toLowerCase()) > -1) {
					Log.info('Twitch', logHeader + ' ' + cli.yellowBright(channel) + ' ' + cli.yellow('(' + this.idMappings[channel] + ')') + ' / ' + (self ? cli.magentaBright(userstate.username) : cli.greenBright(userstate.username)) + ': ' + message);
				}
			})

			client.on('part', (channel, username) => {
				if(username == this.settings.services.twitch.username.toLowerCase()) {
					Log.info('Twitch', logHeader + ' Left channel: ' + channel + '.');

					this.channelsJoined.splice(this.channelsJoined.indexOf(channel), 1);
					this.connectionChannels[client.id].splice(this.connectionChannels[client.id].indexOf(channel), 1);
					delete this.channelClients[channel];
				}
			})
		})
	}

	async start() {
		for(let autojoinObject of this.settings.services.twitch.autojoin) {
			var channel = this.getChannel(autojoinObject.id.toString());
					
			this.idMappings['#' + autojoinObject.name] = autojoinObject.id;
			this.idMappings[autojoinObject.name] = autojoinObject.id;
			this.nameMappings[autojoinObject.id] = autojoinObject.name;

			await this.join(channel);
		}

		this.updateChannels();

		setInterval(() => {
			this.updateChannels()
		}, 2000);

		while(true) {
			await this.parseNextQueueMessage();
		}
	}

	async updateChannels() {
		if(!this.updatingChannels) {
			// This is so fucking ugly, I know.
			Log.info('Twitch', 'Starting the channel check.');
			this.updatingChannels = true;

			var channels = await this.db.smembersAsync('service:twitch:targets:enabled');

			if(!this.settings.services.twitch.joinOffline) {
				for(let [index, chunk] of Tools.chunkArray(channels, 100).entries()) {
					// Fucking lmao
					// Log.info('Twitch', 'Checking channels ' + (index * 100 + 1) + ' to ' + (index * 100 + chunk.length) + '...')

					var data: TwitchGetLiveStreamsResponse = await this.parseChunk(chunk);
					for(let stream of data.streams) {
						var channel = this.getChannel(stream.channel._id.toString());
						
						this.idMappings['#' + stream.channel.name] = stream.channel._id;
						this.idMappings[stream.channel.name] = stream.channel._id;
						this.nameMappings[stream.channel._id] = stream.channel.name;

						await this.join(channel);
					}
				}
			} else {
				for(let channelId of channels) {
					var channel = this.getChannel(channelId);
					var profile = await this.db.hgetallAsync('service:twitch:user:' + channelId);

					var name = profile.login;

					this.idMappings['#' + name] = channelId;
					this.idMappings[name] = channelId;
					this.nameMappings[channelId] = name;
					
					await this.join(channel);
				}
			}

			Log.info('Twitch', 'Finished the channel check.');
			this.updatingChannels = false;
		}
	}

}