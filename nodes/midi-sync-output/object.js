var getEvents = require('lib/get-events')
var MidiPort = require('lib/midi-port')
var ObservStruct = require('mutant/struct')

module.exports = MidiSync

function MidiSync (context) {
  var offset = window.performance.now() - context.audio.currentTime * 1000
  var midiPort = MidiPort(context, null, {output: true, shared: true})
  var obs = ObservStruct({
    port: midiPort
  })

  var clockLoop = {
    events: [[0, true], [1 / 48, false]],
    length: 1 / 24
  }

  var clockDriftChecker = context.audio.createScriptProcessor(1024 * 8, 0, 1)
  var lastDifference = 0

  clockDriftChecker.onaudioprocess = function (e) {
    var currentOffset = Math.round(window.performance.now() - context.audio.currentTime * 1000)
    var difference = currentOffset - offset

    // remove jitter
    if (lastDifference !== -difference && currentOffset !== offset) {
      lastDifference = currentOffset - offset
      offset = Math.round(currentOffset)
    }
  }

  clockDriftChecker.connect(context.audio.destination)

  var releases = [
    context.scheduler.onSchedule(schedule => {
      getEvents(clockLoop, schedule.from, schedule.to, 1).forEach(function (event) {
        if (event[1] && midiPort.stream) {
          var delta = (event[0] - schedule.from) * schedule.beatDuration
          var at = schedule.time + delta
          midiPort.stream.write([248], getMidiTime(at) + 40)
        }
      })
    })
  ]

  obs.context = context

  obs.start = function (at) {
    midiPort.stream.write([0xFA], getMidiTime(at)) // midi start
  }

  obs.startSync = function (quantizeGrid) {
    quantizeGrid = quantizeGrid || 1
    var position = Math.ceil(context.scheduler.getCurrentPosition() * quantizeGrid) / quantizeGrid
    obs.start(context.scheduler.getTimeAt(position))
  }

  obs.continue = function (at) {
    midiPort.stream.write([0xFB], getMidiTime(at)) // midi start
  }

  obs.stop = function (at) {
    midiPort.stream.write([0xFC], getMidiTime(at)) // midi start
  }

  obs.destroy = function () {
    while (releases.length) {
      releases.pop()()
    }
    clockDriftChecker.disconnect()
    clockDriftChecker.onaudioprocess = null
    midiPort.destroy()
  }

  return obs

  function getMidiTime (at) {
    return at ? (at * 1000) + offset : window.performance.now()
  }
}
