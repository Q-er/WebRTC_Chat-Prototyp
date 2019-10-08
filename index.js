const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  },
  {
    urls: 'turn:numb.viagenie.ca',
    credential: 'muazkh',
    username: 'webrtc@live.com'
  }],
  //iceTransportPolicy: "relay"
};

var clientId = generateClientID();


let pc;

let dataChannel;

var mqttTopic;

var mqttClient;


function mqttConnect(broker, topic) {
  mqttClient = mqtt.connect(broker);
  mqttTopic = "aalen/webrtc/" + topic;

  mqttClient.on('connect', function () {
    mqttClient.subscribe(mqttTopic);
    appendMessage("MQTT connected");
  });
  mqttClient.on('error', function () {
    appendMessage("MQTT connection error");
  });
}

function buttonWaiter() {
  startWebRTC(false);
}

function buttonOfferer() {
  startWebRTC(true);
}

function buttonSend() {
  var textInput = document.getElementById("textInput");

  try {
    var message = textInput.value;
    dataChannel.send(message);
    textInput.value = "";
    appendMessage("-> " + message);
  } catch (error) {
    console.log(error);
  }
}

function appendMessage(message) {
  var newLi = document.createElement("li");
  newLi.innerText = message;
  document.getElementById("history").appendChild(newLi);
}

function generateClientID() {
  var result = '';
  for (var i = 0; i < 6; i++) {
    result += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  }
  return result;
}

function sendMQTTMessage(message) {
  console.log(message);
  mqttClient.publish(mqttTopic, JSON.stringify({ sender: clientId, message: message }));
}

async function startWebRTC(isOfferer) {
  mqttConnect(
    document.getElementById("mqttAddressInput").value,
    document.getElementById("mqttTopicInput").value);

  appendMessage('Starting WebRTC as ' + (isOfferer ? 'offerer' : 'waiter'));
  pc = new RTCPeerConnection(configuration);

  pc.onsignalingstatechange = ev => {
    console.log(pc.signalingState);
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMQTTMessage({ 'candidate': event.candidate });
    }
  };

  pc.ontrack = gotRemoteStream;

  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer(localDescriptionCreated, error => appendMessage(error));
    }

    dataChannel = pc.createDataChannel('chat');
    setupDataChannel();
  } else {
    pc.ondatachannel = async function (event) {
      dataChannel = event.channel;
      setupDataChannel();

    }
  }
  appendMessage("Requesting Video...");
  await startVideo();


  mqttClient.on("message", function (topic, payload) {
    if (topic != mqttTopic) return;
    console.log('Message from server ');
    var parsedPayload = JSON.parse(payload);
    if (parsedPayload.sender == clientId) return;
    var message = parsedPayload.message;
    console.log(message);

    if (message.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp)).then(() => {
        console.log('pc.remoteDescription.type', pc.remoteDescription.type);
        if (pc.remoteDescription.type === 'offer') {
          console.log('Answering offer');
          pc.createAnswer(localDescriptionCreated, error => appendMessage(error));
        }
      });
    } else if (message.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  });

}

function localDescriptionCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMQTTMessage({ 'sdp': pc.localDescription }),
    error => console.error(error)
  );
}

function setupDataChannel() {
  dataChannel.onopen = onDataChannelOpen;
  dataChannel.onmessage = event =>
    appendMessage("<- " + event.data)
}

function onDataChannelOpen() {
  appendMessage("WebRTC connected");
}

async function startVideo() {
  var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  var localVideo = document.getElementById('localVideo');
  localVideo.srcObject = stream;
  console.log(stream);
  stream.getTracks().forEach(track => pc.addTrack(track, stream));
}

function gotRemoteStream(e) {
  var remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo.srcObject !== e.streams[0]) {
    remoteVideo.srcObject = e.streams[0];
  }
}
