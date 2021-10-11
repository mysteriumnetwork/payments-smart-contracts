const { expect } = require('chai')

const assertEvent = function(response, eventName, kwargs) {
    let event = {}
    for(let i=0; i<response.logs.length;i++) {
        if (response.logs[i].event === eventName) {
            event = response.logs[i];
            break
        }
    }
    expect(event.event).to.be.equal(eventName)
    if (kwargs) {
        for(let k in kwargs) {
            expect(event.args[k]).to.be.equal(kwargs[k])
        }
    }
}

module.exports = {
    assertEvent
}