import * as Discord from 'discord.js';

import {Target} from 'mikuia-shared';

import {Log} from '../log';
import {MikuiaService} from './mikuiaService';

export class DiscordService extends MikuiaService {
	private client: Discord.Client;

	async connect() {
		return new Promise((resolve) => {
			this.client = new Discord.Client();

			this.client.login(this.settings.services.discord.token);

			this.client.on('ready', () => {
				Log.info('Discord', 'Connected.');

				this.client.guilds.forEach(async (guild) => {
					await this.syncGuild(guild);
				});

				resolve();
			});

			this.client.on('guildCreate', (guild) => {
				this.syncGuild(guild);
			});

			this.client.on('message', (message) => {
				this.handleDiscordMessage(message);
			});
		});
	}

	getServer(serviceId: string) {
		return this.models.targets.getByServiceId('discord', serviceId);
	}

	async handleDiscordMessage(message: Discord.Message) {
		this.msg.broadcast('service:discord:chat:message', {
			channelId: message.channel.id,
			guildId: message.guild.id,
			userId: message.author.id,
			message: message.content
		});

		var Server = this.getServer(message.guild.id);
		this.handleMessage(Server, message.content, {
			channelId: message.channel.id
		});
	}

	handleResponse(event: any, data: any) {
		var Server = this.getServer(event.service.serviceId);

		this.say(Server, data.message, event.service.meta);
	}

	async join(target: Target) {
		// welp.
	}

	async say(target: Target, message: string, meta: any) {
		var channel = this.client.channels.get(meta.channelId) as Discord.TextChannel;
		channel.send(message);
	}

	async start() {
		// lmao
	}

	async syncGuild(guild: Discord.Guild) {
		Log.info('Discord', `Syncing guild: ${guild.id} (${guild.name})`);
		var ownerId = guild.ownerID;

		var userId = await this.db.hgetAsync('users:service:discord', ownerId);
		if(!userId) return;

		await this.db.delAsync(`target:discord:${guild.id}:permissions`);
		this.db.saddAsync(`target:discord:${guild.id}:permissions`, ownerId);
		this.db.saddAsync(`user:${userId}:service:discord:targets`, guild.id);
		this.db.hmsetAsync(`target:discord:${guild.id}`, {
			image: guild.iconURL,
			name: guild.name
		});
	}
}