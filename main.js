const API_URL = "https://anonymous-chat-backend-rd63.onrender.com";
let socket = null;
let room = null;
let partnerId = null;
let chatId = null;
let editingMessageId = null;

document.getElementById("loginBtn").onclick = async () => {
  const uid = document.getElementById("uidInput").value.trim();
  const nickname = document.getElementById("nicknameInput").value.trim();
  if (!uid || !nickname) return alert("Please enter UID and nickname");

  const res = await fetch(`${API_URL}/auth/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json", uid },
    body: JSON.stringify({ nickname }),
  });

  const data = await res.json();
  if (!res.ok) return alert(data.message || "Login failed");

  const { accessToken, user } = data.data;
  localStorage.setItem("token", accessToken);
  localStorage.setItem("nickname", user.nickname);
  localStorage.setItem("userId", user._id);

  document.getElementById("nicknameDisplay").innerText = user.nickname;
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("chatSection").style.display = "block";

  connectSocket(accessToken);
};

function connectSocket(token) {
  socket = io(API_URL, { auth: { token }, transports: ["websocket"] });

  socket.on("connect", () => console.log("✅ Socket connected"));

  socket.on("waiting_for_match", () => {
    document.getElementById("status").innerText = "⏳ Waiting for match...";
  });

  socket.on("match_found", (data) => {
    chatId = data.chatId;

    room = data.room;
    partnerId = data.partnerId;
    document.getElementById(
      "status"
    ).innerText = `🎯 Matched with ${partnerId}`;
  });

  socket.on("receive_message", renderMessage);
  socket.on("message_edited", renderEditedMessage);

  socket.on("message_deleted", markMessageDeleted);

  socket.on("error_message", (data) => {
    alert("❌ " + data.message);
  });

  socket.on("partner_left", () => {
    document.getElementById("status").innerText = "❌ Partner left.";
    alert("Your chat partner has left.");
  });
}

document.getElementById("findBtn").onclick = () => {
  if (!socket) return alert("Not connected.");
  socket.emit("find_stranger", {
    vibe: "chill",
    goal: "chat",
    gender: "any",
    language: "en",
    age: { min: 18, max: 30 },
    tags: ["test"],
  });
};

document.getElementById("sendBtn").onclick = async () => {
  const content = document.getElementById("messageInput").value.trim();
  const file = document.getElementById("fileInput").files[0];
  const token = localStorage.getItem("token");

  if (!room) return alert("Not in a room.");

  console.log(`editingMessageId ${editingMessageId}`);
  if (editingMessageId) {
    socket.emit("edit_message", {
      room,
      messageId: editingMessageId,
      newContent: content,
    });
    editingMessageId = null;
    document.getElementById("messageInput").value = "";
    return;
  }

  const formData = new FormData();
  let type = "text";

  if (file) {
    formData.append("media", file);
    type = file.type.split("/")[0];
    console.log("type", type);
  } else {
    formData.append("content", content);
  }

  formData.append("type", type); // ✅ include type in FormData

  console.log("formData", formData);
  console.log("chatId", chatId);

  try {
    const res = await fetch(`${API_URL}/chat/send/${chatId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, // ✅ Only include Authorization
      },
      body: formData, // ✅ Correct usage
    });

    const data = await res.json();
    console.log("mediaUrl", data.url);

    document.getElementById("messageInput").value = "";
    document.getElementById("fileInput").value = "";
  } catch (err) {
    console.error("Error sending message:", err);
    alert("Failed to send message.");
  }
};

function renderMessage(msg) {
  const box = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.className = "message";

  div.id = `msg-${msg._id}`;

  console.log("msg", msg);

  const currentUserId = localStorage.getItem("userId");
  const isOwn = msg.sender === currentUserId;

  let text = isOwn ? `🟢 You:` : `🔵 ${msg.nickname}:`;
  if (msg.deleted) text += " (deleted)";
  else if (msg.type === "text") text += ` ${msg.content}`;
  else if (msg.type.startsWith("image"))
    text += ` <img src="${msg.mediaUrl}" width="100"/>`;
  else text += ` 📎 <a href="${msg.mediaUrl}" target="_blank">Download</a>`;

  div.style.textAlign = isOwn ? "right" : "left";
  div.innerHTML = text;

  if (isOwn && !msg.deleted) {
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.className = "edit-btn";
    editBtn.onclick = () => {
      document.getElementById("messageInput").value = msg.content;
      editingMessageId = msg._id;
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.className = "delete-btn";
    deleteBtn.onclick = () => {
      socket.emit("delete_message", { room, messageId: msg._id });
    };

    div.appendChild(editBtn);
    div.appendChild(deleteBtn);
  }

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function renderEditedMessage(msg) {
  console.log(`msg :: id ${msg.messageId} content ${msg.newContent}`);
  const div = document.getElementById(`msg-${msg.messageId}`);
  if (div) div.innerHTML = `📝 Edited: ${msg.newContent}`;
}

function markMessageDeleted(msg) {
  const div = document.getElementById(`msg-${msg.messageId}`);
  if (div) div.innerHTML = "(deleted)";
}
