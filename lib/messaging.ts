import * as cli from 'cli-color';
import * as redis from 'redis';
import * as zmq from 'zeromq';

import {Log} from './log';
import {Services} from './services';
import {Settings} from './settings';
import {Tools} from './tools';

export class Messaging {
    private handlers = {};
    private plugins = {};
    private tokens = {};

    private pub: zmq.Socket;
    private rep: zmq.Socket;

    constructor(private db: redis.RedisClient, private services: Services, private settings: Settings)  {
        this.pub = zmq.socket('pub');
        this.rep = zmq.socket('rep');

        this.pub.bindSync(this.settings.zeromq.address + ':' + this.settings.zeromq.ports[0]);

        this.rep.bindSync(this.settings.zeromq.address + ':' + this.settings.zeromq.ports[1]);
        this.rep.on('message', (message) => {
            Log.info('0mq', 'Received a message: ' + cli.greenBright(message));
            this.parseMessage(JSON.parse(message.toString()));
        })

        Log.info('0mq', 'REP listening on: ' + cli.redBright(this.settings.zeromq.address + ':' + this.settings.zeromq.ports[0]));
        Log.info('0mq', 'PUB listening on: ' + cli.redBright(this.settings.zeromq.address + ':' + this.settings.zeromq.ports[1]));

        setInterval(() => {
            this.checkHeartbeats();
        }, 30 * 1000);
    }

    broadcast(topic: string, message: object) {
        this.pub.send([topic, JSON.stringify(message)]);
    }

    checkHeartbeats() {
        Log.info('0mq', 'Checking heartbeats...');
        Object.keys(this.plugins).map((name) => {
            var plugin = this.plugins[name];

            Log.info('0mq', 'Plugin: ' + cli.redBright(name) + ' - last heartbeat: ' + cli.greenBright(((new Date()).getTime() - plugin.heartbeat) / 1000) + ' seconds ago.');
            if((new Date()).getTime() - plugin.heartbeat > 30 * 1000) {
                this.removePlugin(name);
            }
        })
    }

    getHandler(handler: string) {
        return this.handlers[handler];
    }

	handleHeartbeat(req) {
		if(this.tokens[req.token]) {
			var heartbeat = (new Date()).getTime();
			this.plugins[this.tokens[req.token]].heartbeat = heartbeat;
		
			this.db.zaddAsync('mikuia:plugins:heartbeats', heartbeat, this.tokens[req.token]);

			return this.reply(req, {
				error: false
			});
		}

		return this.reply(req, {
			type: 'error',
			error: true
		});
	}

	handleIdentify(req) {
		var name = req.args.name;

		if(name && Object.keys(this.plugins).indexOf(name) == -1) { 
			var heartbeat = (new Date()).getTime();                   
			var token = Math.random().toString(36).slice(-32);
			this.tokens[token] = name;

			this.plugins[name] = {
				handlers: [],
				heartbeat: heartbeat,
				token: token
			};

			this.db.zaddAsync('mikuia:plugins:heartbeats', heartbeat, name);

			return this.reply(req, {
				type: 'string',
				error: false,
				message: token
			})
		}

		return this.reply(req, {
			type: 'error',
			error: true
		});
	}

	handleRegisterLocale(req) {
		if(this.tokens[req.token]) {
			const {data, language, type} = req.args;
			const plugin = this.tokens[req.token];

			switch(type) {
				case 'handlers':
					for(var handlerId of Object.keys(data)) {
						var handler = data[handlerId];
						
						if(handler.description) this.db.hsetAsync(`locale:${language}:handlers`, handlerId, handler.description);
						
						if(handler.settings && Object.keys(handler.settings).length > 0) {
							for(var settingId of Object.keys(handler.settings)) {
								var details = handler.settings[settingId];
			
								this.db.hmsetAsync(`locale:${language}:plugin:${plugin}`, {
									[`${settingId}.name`]: details.name,
									[`${settingId}.description`]: details.description
								});
							}
						}
					}
					break;
				case 'plugin':
					if(data.name) this.db.hsetAsync(`locale:${language}:plugins`, plugin, data.name);
					if(data.description) this.db.hsetAsync(`locale:${language}:plugins`, plugin, data.description);
					break;
			}

			return this.reply(req, {
				error: false
			});
		}

		return this.reply(req, {
			type: 'error',
			error: true
		});
	}

	handleRegisterHandler(req) {
		var name = req.args.name;

		if(!this.isHandler(name) && this.tokens[req.token]) {
			this.handlers[name] = {
				plugin: this.tokens[req.token],
				info: Tools.extend({
					description: '-',
					anonymous: true,
					settings: {}
				}, req.args.info)
			}

			this.plugins[this.tokens[req.token]].handlers.push(name);

			this.db.saddAsync(`plugin:${this.tokens[req.token]}:handlers`, name);
			this.db.hsetAsync('mikuia:handlers', name, this.tokens[req.token]);
			this.db.hmsetAsync(`handler:${name}`, {
				plugin: this.tokens[req.token],
				description: this.handlers[name].info.description,
				settings: JSON.stringify(this.handlers[name].info.settings)
			});

			return this.reply(req, {
				error: false
			});
		}

		return this.reply(req, {
			type: 'error',
			error: true
		});
	}

    isHandler(handler: string) {
        return Object.keys(this.handlers).indexOf(handler) > -1;
    }

    parseMessage(req) {
        switch(req.method) {
            case "getExample":
                return this.reply(req, {
                    type: 'string',
                    message: 'test123',
                    error: false
                });

            case "heartbeat":
				return this.handleHeartbeat(req);
                
            case "identify":
				return this.handleIdentify(req);
				
			case "registerLocale":
                return this.handleRegisterLocale(req);

            case "registerHandler":
                return this.handleRegisterHandler(req);
            
            case "respond":
                if(this.tokens[req.token]) {
                    var event = req.args.event;
                    var data = req.args.data;

                    var service = this.services.get(event.service.service);
                    if(service) {
                        service.handleResponse(event, data);

                        return this.reply(req, {
                            error: false
                        })
                    }
                }

                return this.reply(req, {
                    type: 'error',
                    error: true
                })

            default:
                console.log('the fuck.');
                return this.reply(req, {
                    type: 'error',
                    error: true
                });
        }
    }

    removePlugin(name) {
        Log.warning('0mq', 'Removing plugin: ' + cli.redBright(name) + '.');

        var plugin = this.plugins[name];

        for(let handler of plugin.handlers) {
            delete this.handlers[handler];
        }

        delete this.tokens[plugin.token];
        delete this.plugins[name];
    }

    reply(req, res) {
        this.rep.send(JSON.stringify(Tools.extend(req, res)));
    }

}