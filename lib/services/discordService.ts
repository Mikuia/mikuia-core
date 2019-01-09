import * as Discord from 'discord.js';

import {Log} from '../log';
import {MikuiaService} from './mikuiaService';
import {Target} from '../target';

export class DiscordService extends MikuiaService {
	private client: Discord.Client;

	async connect() {
		return new Promise((resolve) => {
			this.client = new Discord.Client();

			this.client.login(this.settings.services.discord.token);

			this.client.on('ready', () => {
				Log.info('Discord', 'Connected.');
				resolve();
			})

			this.client.on('message', (message) => {
				this.handleDiscordMessage(message);
			})
		});
	}

	getServer(serviceId: string) {
		return this.models.getTarget('discord', serviceId);
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
}