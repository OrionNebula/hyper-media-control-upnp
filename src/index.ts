import { registerSubPlugin } from 'hyper-plugin-extend'
import { HyperMediaUpnp } from './HyperMediaUpnp'

export const onRendererWindow = registerSubPlugin('hyper-media-control', HyperMediaUpnp)
