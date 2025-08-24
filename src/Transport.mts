import { ProxyServer } from "./ProxyServer.mjs"

export type TTransportOptions = {
	port: number
}
export abstract class Transport {

	protected server!: ProxyServer

	public abstract start(): Promise<Transport>

	public constructor(protected options: TTransportOptions) {
	}

	public registerServer(server: ProxyServer): Transport {
		this.server = server
		return this
	}

}
