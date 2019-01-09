import * as cli from 'cli-color';
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

    constructor(private services: Services, private settings: Settings)  {
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
                if(this.tokens[req.token]) {
                    this.plugins[this.tokens[req.token]].heartbeat = (new Date()).getTime();
                
                    return this.reply(req, {
                        error: false
                    });
                }

                return this.reply(req, {
                    type: 'error',
                    error: true
                });
                
            case "identify":
                var name = req.args.name;

                if(name && Object.keys(this.plugins).indexOf(name) == -1) {                    
                    var token = Math.random().toString(36).slice(-32);
                    this.tokens[token] = name;

                    this.plugins[name] = {
                        handlers: [],
                        heartbeat: (new Date()).getTime(),
                        token: token
                    };

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

            case "registerHandler":
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

                    return this.reply(req, {
                        error: false
                    });
                }

                return this.reply(req, {
                    type: 'error',
                    error: true
                });
            
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