import { Transport } from "./Transport.mjs";


export class ProxyServer {

	protected transports: Array<Transport> = []

	public constructor() {

	}

	public registerTransport(transport: Transport) {

		transport.registerServer(this)
		this.transports.push(transport)

	}

	public async start() {
		this.transports.forEach(t => t.start())
	}

}
