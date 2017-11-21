import * as bluebird from 'bluebird';
import * as redis from 'redis';

bluebird.promisifyAll(redis);

import {Log} from './lib/log';	
import {Messaging} from './lib/messaging';
import {Models} from './lib/models';
import {Services} from './lib/services';
import {Settings} from './lib/settings';
import {TwitchService} from './lib/services/twitchService'

export class Mikuia {
	private db: redis.RedisClient;
	private msg: Messaging;
	private models: Models;
	private services: Services;
	private settings: Settings;

	async initDatabase() {
		return new Promise((resolve) => {
			this.db = redis.createClient(this.settings.redis.port, this.settings.redis.host, this.settings.redis.options);

			this.db.on('ready', () => {
				Log.success('Redis', 'Connected to Redis.')
				this.db.select(this.settings.redis.db);
				resolve();
			})

			this.db.on('error', (error) => {
				Log.fatal('Redis', 'Something broke.')
				console.log(error);
			})
		})
	}

	initMessaging() {
		this.msg = new Messaging(this.services, this.settings);
	}

	initModels() {
		this.models = new Models(this.db);
	}

	initServices() {
		this.services = new Services();
	}

	loadSettings() {
		try {
			this.settings = require('./settings.json');
		} catch(error) {
			throw new Error('Failed to load the config file.');
		}
	}

	async start() {
		this.loadSettings();
		
		await this.initDatabase();
		this.initModels();
		this.initServices();
		this.initMessaging();		

		this.services.add('twitch', new TwitchService(this.settings, this.db, this.models, this.msg));

		await this.services.connect();
		this.services.start();
	}
}