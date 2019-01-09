import * as redis from 'redis';

import {Messaging} from '../messaging';
import {Models} from '../models';
import {Settings} from '../settings'
import {Target} from '../target';

export abstract class MikuiaService {
	abstract connect();
	abstract handleResponse(event: object, data: object);
	abstract join(target: Target);
	abstract say(target: Target, message: string, meta: object);
	abstract start();

	constructor(protected settings: Settings, protected db: redis.RedisClient, protected models: Models, protected msg: Messaging) {}

	async handleMessage(target: Target, message: string, meta: object) {
		var tokens = message.split(' ');
		var trigger = tokens[0];

		var handler = await target.getCommandHandler(trigger);

		if(handler) {
			if(this.msg.isHandler(handler)) {
				var plugin = this.msg.getHandler(handler).plugin;
				var isEnabled = await target.isPluginEnabled(plugin);

				if(isEnabled) {
					var settings = await target.getCommandSettings(trigger, this.msg.getHandler(handler).info.settings);

					this.msg.broadcast('event:handler:' + handler, {
						service: {
							meta: meta,
							message: message,
							service: target.service,
							serviceId: target.serviceId
						},
						message: message,
						tokens: tokens,
						settings: settings
					});
				} else {
					this.say(target, 'Sorry, could not process your command. (plugin disabled: ' + plugin + ')', meta);
				}
			} else {
				this.say(target, 'Sorry, could not process your command. (handler missing: ' + handler + ')', meta);
			}
		}
	}
}
