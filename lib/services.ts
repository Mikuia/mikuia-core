import {MikuiaService} from './services/mikuiaService';

export class Services {
    private services = {};

    add(name: string, service: MikuiaService): void {
        this.services[name] = service;
    }

    get(name: string): MikuiaService {
        return this.services[name];
    }

    async connect() {
        for(let serviceName of Object.keys(this.services)) {
            var service: MikuiaService = this.services[serviceName];
            await service.connect();
        }
    }

    start() {
        for(let serviceName of Object.keys(this.services)) {
            var service: MikuiaService = this.services[serviceName];
            service.start();
        }
    }
}