import * as redis from 'redis';

import {Tools} from './tools';

export class Channel {
	public id: number;
	public type: string;

	constructor(id: number, type: string, private db: redis.RedisClient) {
		this.id = id;
		this.type = type;
	}

	async getCommandHandler(trigger: string): Promise<string | null> {
		return await this.db.hgetAsync('channel:' + this.type + ':' + this.id + ':commands', trigger);
	}

	async getCommandSettings(trigger: string, defaults: object | null): Promise<object | null> {
		var settings = await this.db.hgetallAsync('channel:' + this.type + ':' + this.id + ':command:' + trigger);
		if(!settings) {
			settings = {};
		}
		if(defaults) {
			for(let setting in defaults) {
				if(defaults[setting].default != undefined && settings[setting] == undefined) {
					settings[setting] = defaults[setting].default;
				}
			}
		}
		return settings;
	}

	async getName(): Promise<string> {
		return await this.db.hgetAsync('channel:' + this.type + ':' + this.id, 'username');
	}

	async isPluginEnabled(plugin: string): Promise<boolean> {
		var result = await this.db.sismemberAsync('channel:' + this.type + ':' + this.id + ':plugins', plugin);
		return (result == 1) ? true : false;
	}

}