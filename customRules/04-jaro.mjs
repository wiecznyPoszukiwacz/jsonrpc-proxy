import { ProxyHandler } from '../dist/commonHandlers/ProxyHandler.mjs'

const handler = new ProxyHandler({
})

handler.addHandlerRule({
	method: 'getCatalogData',
	upstreamUrl: 'http://localhost:4003/rpc'
})

export const handlers = [handler] 
