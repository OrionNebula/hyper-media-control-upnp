// import './node-ssdp'
import { Client, SsdpHeaders } from 'node-ssdp'
import { EventEmitter } from 'events'
import * as DeviceClient from 'upnp-device-client'
import { parseString } from 'xml2js'
import { PlayerManager, HyperMediaConfig, Status, State, MediaPlugin } from 'hyper-media-control'

interface HyperMediaUpnpConfig {

}

interface Players {
  [key: string]: DeviceClient
}

export class HyperMediaUpnp extends EventEmitter implements MediaPlugin {
  playerManager: PlayerManager
  private lastStatus: Status
  private playerIndex: number
  private activePlayer: DeviceClient
  private searchHandle: NodeJS.Timer
  private eventPumpHandle: NodeJS.Timer
  private players: Players
  private readonly client: Client
  private readonly config: HyperMediaUpnpConfig
  constructor (playerManager: PlayerManager, config: HyperMediaConfig) {
    super()
    this.playerManager = playerManager
    this.config = { ...config['upnp'] }
    this.players = {}
    this.playerIndex = 0
    this.client = new Client()
    this.lastStatus = { isRunning: false, state: State.Stopped }
  }

  playerName () {
    return 'upnp'
  }

  iconUrl () {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAaQAAAGkBcaGY2AAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAASXSURBVHic7dpZiJVlGMDx34wzmWVquTdplq1kFxmWpllWRgl20SQUQcuFLdBmEIIQtBBYXrRdhJUV4UVRUVqWLUhRUYgUWZlpCZKkuS9JOTpNF88c55tvzsw5ZzrnjEPfHw7M927P827P+7zPO2RkZGRkZGRkZGRkZPwPqelpBbpBH4zBGRiG/q2/fdiKX/A9mntIv7JzAq7Fk1iJA2gp8NuDl3B2ocaP1BVwEhpxDaairjV9NzZhC5qwH8fheIzGyFQ7B3Evnqu8yv+dfrgRH4nlux6LcCemYGARbQzFLLwuBii3ImZVQN+yMQrzsRFv4lY0lKHdsXhfDMDvwnYcUYwTM7wYM9G3AjJq8bQYhGkVaL9bnIuHMRsDqiCvFita5fUoDbgeV6i+8Z2E+6os8zA1GC4se09ycb7EOsxNfO/Ai100Mhy3JL7X4N2UkItSdZqwDduFpV9flLrdY7bwG5L8KRykbRjSqkc7kg7EmgICxqfKL07lP6qwk7IRD+Co4vpUEmsLyG7G55iRq1BbASUKMRpP4FPhwlaTWuFTLMNjtHlYleId/IwRwqM7JZE3CQuEo1MJWsRAHyV8jatxbCJ/Hr7KFazUFmhM5PXBQ6n8/cq7CpJbIH0ZGowvU/I/qPQKSNIszv+bxW0OjsHp+BYTcFmi/ALU4wZxdA7HX6ITz2NXifJ34H58nUg7r5oDQIz6Om0DQFxkiL05P5G+BG/jrFQbM8UF53L8VKL8tanvQdU2gjU4LZX2Rydll+vY+RwjxfYr1aEam5ZdzQGoF1vg1ETaVh1nJcfJ+A5XCiPWKO75OcZjYgnyh+KpVNpnld4Ct4sODBPKjkjlP6vzyM0uTBcODBEHOAePJMpM1GrJ81CDhWLgG3CJ9heuZjxT6QGY3kXeEjzeRf4b2jqf44vU97Au6tfgtk7y/sHdWJXeAoW2RDm2zBqxMhpFxKYzPsmTlh6Q+hJlHxK2ZYrWKFF6BQwu0MCQEgUuxDfi+NqJH4QrXAxb8qQ1lSC7BXe0/r0Hm7FahNUOU4e92u7lg4Xn1JmgdMxtbwElPsZbxenbgQPdrJejRfgLXVKr/UjXYHIX5aemvvPNUq+iVkfD8qD88bMzRUAjSbpur6MWr6TSpmEpLhSu6hARrV2BoxPlNoirZa+mTnTiVdyUSJ8hcWfOQzPu0bUV7xXkjrXZwmC0FFFnt1gRyyqlVDXJHYNN4mx+QayEycJnHyBme7t4b/tQbJkOYaVWfhQOTI5NJeiyLlV3Z54y+1JlVqfylyfSipnMDlzVnUplZJDKvA8URV9h/KpNjQimTlPYEau4In+r3gvKQOGrz9E+VNajrBb383EVar8frsPLIihZjjfAsjJPGI99IlhZ6mUjH2OET74Uq3CX6jyJdYt+wpLngoYbRKDzAsUZp5EifjcHr+E3cWwuwqWOwP9HyKdQg4jFTUilH8Sv2l55Dokwc39xLx+lLey8XRxJS/CesC29inrhD6wUHS302rNZDNpcEaXpiQeXblHMkhyE83GimOlD4n6/R2yRDSLknJGRkZGRkZGRkZGRkdFb+BdooRTNIF2IWAAAAABJRU5ErkJggg=='
  }

  changeLibrary () {
    if (Object.keys(this.players).length > 0) {
      this.setActivePlayer(this.players[Object.keys(this.players)[++this.playerIndex % Object.keys(this.players).length]])
    }
  }

  playPause () {
    if (this.lastStatus.state === 'paused') {
      return new Promise<Status>((resolve, reject) => {
        this.activePlayer.callAction('AVTransport', 'Play', { InstanceID: 0, Speed: 1 }, (err, result) => {
          if (err) {
            resolve(this.lastStatus = this.playerDropOut())
            return
          }

          this.activePlayer.callAction('AVTransport', 'GetTransportInfo', { InstanceID: 0 }, (err, result) => {
            if (err) {
              resolve(this.lastStatus = this.playerDropOut())
              return
            }

            this.lastStatus = Object.assign(this.lastStatus, {
              state: result.CurrentTransportState.toLowerCase().startsWith('paused') ? 'paused' : 'playing'
            })

            resolve(this.lastStatus)
          })
        })
      })
    } else {
      return new Promise<Status>((resolve, reject) => {
        this.activePlayer.callAction('AVTransport', 'Pause', { InstanceID: 0, Speed: 1 }, (err, result) => {
          if (err) {
            resolve(this.lastStatus = this.playerDropOut())
            return
          }

          this.activePlayer.callAction('AVTransport', 'GetTransportInfo', { InstanceID: 0 }, (err, result) => {
            if (err) {
              resolve(this.lastStatus = this.playerDropOut())
              return
            }

            this.lastStatus = Object.assign(this.lastStatus, {
              state: result.CurrentTransportState.toLowerCase().startsWith('paused') ? 'paused' : 'playing'
            })

            resolve(this.lastStatus)
          })
        })
      })
    }
  }

  nextTrack () {
    return new Promise<Status>((resolve, reject) => {
      this.activePlayer.callAction('AVTransport', 'Next', { InstanceID: 0, Speed: 1 }, (err, result) => {
        if (err) {
          resolve(this.lastStatus = this.playerDropOut())
          return
        }

        this.activePlayer.callAction('AVTransport', 'GetPositionInfo', { InstanceID: 0 }, (err, result) => {
          if (err) {
            resolve(this.lastStatus = this.playerDropOut())
            return
          }

          this.composeStatus(result).then(status => {
            this.lastStatus = status
            resolve(status)
          })
        })
      })
    })
  }

  previousTrack () {
    return new Promise<Status>((resolve, reject) => {
      this.activePlayer.callAction('AVTransport', 'Previous', { InstanceID: 0, Speed: 1 }, (err, result) => {
        if (err) {
          resolve(this.lastStatus = this.playerDropOut())
          return
        }

        this.activePlayer.callAction('AVTransport', 'GetPositionInfo', { InstanceID: 0 }, (err, result) => {
          if (err) {
            resolve(this.lastStatus = this.playerDropOut())
            return
          }

          this.composeStatus(result).then(status => {
            this.lastStatus = status
            resolve(status)
          })
        })
      })
    })
  }

  activate () {
    this.emit('status', { isRunning: false })
    this.client.on('response', (headers, statuscode, rinfo) => {
      if (headers.ST === 'urn:schemas-upnp-org:service:AVTransport:1' && this.players[headers.LOCATION] === undefined) {
        // We've found an AV renderer
        console.log(`Located a renderer: ${headers.LOCATION}`)
        let av = new DeviceClient(headers.LOCATION)
        this.players[headers.LOCATION] = av
        if (Object.keys(this.players).length === 1) this.setActivePlayer(av)
      }
    })

    this.client.start()
    this.searchHandle = setInterval(() => this.client.search('ssdp:all'), 3000)
    this.client.search('ssdp:all')

    this.eventPumpHandle = setInterval(() => this.eventPump(), 500)
  }

  eventPump () {
    if (!this.activePlayer) return

    this.activePlayer.callAction('AVTransport', 'GetPositionInfo', { InstanceID: 0 }, (err, result) => {
      if (err) {
        this.lastStatus = this.playerDropOut()
        this.emit('status', this.lastStatus)
        return
      }

      this.composeStatus(result).then(status => {
        this.lastStatus = status
        this.emit('status', status)
      })
    })

    this.activePlayer.callAction('AVTransport', 'GetTransportInfo', { InstanceID: 0 }, (err, result) => {
      if (err) {
        this.lastStatus = this.playerDropOut()
        this.emit('status', this.lastStatus)
        return
      }

      this.lastStatus = Object.assign(this.lastStatus, {
        state: result.CurrentTransportState === 'PAUSED_PLAYBACK' ? 'paused' : result.CurrentTransportState.toLowerCase(),
        track: result.CurrentTransportState === 'STOPPED' ? {} : this.lastStatus.track
      })
    })
  }

  deactivate () {
    if (this.client) {
      this.client.removeAllListeners()
      this.client.stop()
    }

    this.players = {}
    clearInterval(this.eventPumpHandle)
    clearInterval(this.searchHandle)
    this.lastStatus = { isRunning: false, state: State.Stopped }
    this.activePlayer = null
  }

  private composeStatus (status: any): Promise<Status> {
    return new Promise((resolve, reject) => {
      status.TrackMetaData && parseString(status.TrackMetaData, (err, track) => {
        if (err) {
          resolve(this.playerDropOut())
          return
        }

        track = track['DIDL-Lite'].item[0]
        resolve(Object.assign(this.lastStatus, {
          isRunning: true,
          // state: (status.TransportState && status.TransportState.toLowerCase()) || 'stopped',
          progress: status.RelTime.split(':').reduce((accumulator, currentValue, currentIndex) => {
            return accumulator + Math.max(60 * (2 - currentIndex), 1) * Number(currentValue)
          }, 0) * 1000,
          track: Object.assign(this.lastStatus.track || {}, (track && {
            name: track['dc:title'][0],
            artist: track['dc:creator'][0],
            duration: status.TrackDuration.split(':').reduce((accumulator, currentValue, currentIndex) => {
              return accumulator + Math.max(60 * (2 - currentIndex), 1) * Number(currentValue)
            }, 0) * 1000
          }) || {})
        }))
      })
    })
  }

  private playerDropOut (): Status {
    if (this.activePlayer) {
      delete this.players[this.activePlayer.url]
      this.activePlayer = this.players[Object.keys(this.players)[0]]
    }
    return { isRunning: false, state: State.Stopped }
  }

  private setActivePlayer (player: DeviceClient) {
    if (this.activePlayer === player) return

    this.activePlayer = player
  }
}
