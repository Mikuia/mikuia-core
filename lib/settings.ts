import * as redis from 'redis';

export interface Settings {
	redis: {
		port: number,
		host: string,
		db: number,
		options: redis.ClientOpts
	},
	services: {
		twitch: {
			username: string,
			oauth: string,
			connections: number,
			clientId: string,
			autojoin: TwitchChannelAutojoinObject[]
		}
	},
	zeromq: {
		address: string,
		ports: number[]
	}
}

export interface TwitchChannelAutojoinObject {
	id: number,
	name: string
}