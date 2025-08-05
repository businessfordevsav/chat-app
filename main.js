const API_URL =
   'https://anonymous-chat-backend-rd63.onrender.com' /* "http://localhost:3000" */;
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
  // Enhanced socket configuration for reliability
  socket = io(API_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    timeout: 20000,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    maxReconnectionAttempts: 5,
    randomizationFactor: 0.5,
    forceNew: true,
  });

  // Connection events
  socket.on("connect", () => {
    console.log("✅ Socket connected");
    document.getElementById("status").innerText = "🟢 Connected";
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Socket disconnected:", reason);
    document.getElementById("status").innerText = "🔴 Disconnected";
  });

  socket.on("reconnect", (attemptNumber) => {
    console.log("🔄 Socket reconnected after", attemptNumber, "attempts");
    document.getElementById("status").innerText = "🟢 Reconnected";
  });

  socket.on("reconnect_attempt", (attemptNumber) => {
    console.log("🔄 Reconnection attempt:", attemptNumber);
    document.getElementById(
      "status"
    ).innerText = `🟡 Reconnecting... (${attemptNumber})`;
  });

  socket.on("reconnect_error", (error) => {
    console.error("❌ Reconnection failed:", error);
    document.getElementById("status").innerText = "🔴 Reconnection failed";
  });

  socket.on("reconnect_failed", () => {
    console.error("❌ All reconnection attempts failed");
    document.getElementById("status").innerText = "🔴 Connection lost";
    alert("Connection lost. Please refresh the page.");
  });

  // Enhanced matching events
  socket.on("waiting_for_match", () => {
    document.getElementById("status").innerText = "⏳ Waiting for match...";
  });

  socket.on("match_timeout", () => {
    document.getElementById("status").innerText = "⏰ Match request timed out";
    alert("Match request timed out. Please try again.");
  });

  socket.on("match_found", (data) => {
    chatId = data.chatId;
    room = data.room;
    partnerId = data.partnerId;
    document.getElementById(
      "status"
    ).innerText = `🎯 Matched with ${partnerId}`;
    console.log("Match found:", data);
  });

  socket.on("reconnected_to_room", (data) => {
    room = data.room;
    partnerId = data.partnerId;
    chatId = data.chatId;
    document.getElementById("status").innerText =
      "🔁 Reconnected to previous chat";
    console.log("Reconnected to room:", data);
  });

  socket.on("partner_reconnected", ({ userId }) => {
    document.getElementById(
      "status"
    ).innerText = `👥 Partner reconnected: ${userId}`;
    console.log("Partner reconnected:", userId);
  });

  socket.on("partner_left", (data) => {
    const reason = data?.reason || "unknown";
    document.getElementById("status").innerText = `❌ Partner left (${reason})`;
    if (reason === "chat_ended") {
      alert("Your chat partner ended the conversation.");
    } else {
      alert("Your chat partner has left the conversation.");
    }
    console.log("Partner left:", data);
  });

  socket.on("chat_ended", (data) => {
    room = null;
    partnerId = null;
    chatId = null;
    document.getElementById("chatBox").innerHTML = "";
    document.getElementById("status").innerText = "💬 Chat ended";
    console.log("Chat ended:", data);
  });

  // Message events
  socket.on("receive_message", renderMessage);
  socket.on("message_edited", renderEditedMessage);
  socket.on("message_deleted", markMessageDeleted);

  // Typing indicators
  socket.on("partner_typing", ({ isTyping }) => {
    const status = document.getElementById("status");
    if (isTyping) {
      status.innerText = "💭 Partner is typing...";
    } else {
      status.innerText = `🎯 Matched with ${partnerId}`;
    }
  });

  // Enhanced error handling
  socket.on("error_message", (data) => {
    console.error("Socket error:", data);
    alert("❌ " + (data.message || "An error occurred"));
  });

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
    alert(
      "Failed to connect. Please check your internet connection and try again."
    );
  });

  // Heartbeat mechanism
  socket.on("ping", () => {
    socket.emit("pong");
  });

  // Setup periodic ping to maintain connection
  setInterval(() => {
    if (socket.connected) {
      socket.emit("ping");
    }
  }, 25000);
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

document.getElementById("endBtn").onclick = () => {
  if (!socket) return;
  socket.emit("end_chat");
  room = null;
  partnerId = null;
  chatId = null;
  document.getElementById("chatBox").innerHTML = "";
  document.getElementById("status").innerText = "Chat ended.";
};

document.getElementById("sendBtn").onclick = async () => {
  const content = document.getElementById("messageInput").value.trim();
  const file = document.getElementById("fileInput").files[0];
  const token = localStorage.getItem("token");

  if (!room) {
    alert("Not in a room.");
    return;
  }

  if (!content && !file) {
    alert("Please enter a message or select a file.");
    return;
  }

  // Handle message editing
  if (editingMessageId) {
    if (!content) {
      alert("Message content cannot be empty.");
      return;
    }

    socket.emit("edit_message", {
      room,
      messageId: editingMessageId,
      newContent: content,
    });
    editingMessageId = null;
    document.getElementById("messageInput").value = "";
    document.getElementById("messageInput").placeholder = "Type a message...";
    return;
  }

  // Handle file or text message
  const formData = new FormData();
  let type = "text";

  if (file) {
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    formData.append("media", file);
    type = file.type.split("/")[0];

    // Validate file type
    const allowedTypes = ["image", "video", "audio", "application"];
    if (!allowedTypes.includes(type)) {
      alert("Unsupported file type");
      return;
    }
  } else {
    if (content.length > 1000) {
      alert("Message is too long (max 1000 characters)");
      return;
    }
    formData.append("content", content);
  }

  formData.append("type", type);

  try {
    const res = await fetch(`${API_URL}/chat/send/${chatId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to send message");
    }

    document.getElementById("messageInput").value = "";
    document.getElementById("fileInput").value = "";

    // Stop typing indicator
    socket.emit("typing", { room, isTyping: false });
  } catch (err) {
    console.error("Error sending message:", err);
    alert("Failed to send message: " + err.message);
  }
};

// Add typing indicator support
let typingTimer;
document.getElementById("messageInput").addEventListener("input", (e) => {
  if (!room) return;

  // Send typing indicator
  socket.emit("typing", { room, isTyping: true });

  // Clear previous timer
  clearTimeout(typingTimer);

  // Stop typing indicator after 2 seconds of inactivity
  typingTimer = setTimeout(() => {
    socket.emit("typing", { room, isTyping: false });
  }, 2000);
});

// Handle Enter key for sending messages
document.getElementById("messageInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("sendBtn").click();
  }
});

function renderMessage(msg) {
  try {
    const box = document.getElementById("chatBox");
    const div = document.createElement("div");
    div.className = "message";
    div.id = `msg-${msg._id}`;
    const currentUserId = localStorage.getItem("userId");
    const isOwn = msg.sender === currentUserId;

    let text = isOwn ? `🟢 You:` : `🔵 ${msg.nickname || "Anonymous"}:`;

    if (msg.message?.deleted || msg.deleted) {
      text += " <em>[This message was deleted]</em>";
    } else if ((msg.message?.type || msg.type) === "text") {
      text += ` ${msg.message?.content || msg.content || ""}`;
      if (msg.message?.edited || msg.edited) {
        text += ` <small><em>(edited)</em></small>`;
      }
    } else if (
      (msg.message?.type || msg.type) === "image" ||
      (msg.message?.type || msg.type)?.startsWith("image")
    ) {
      text += ` <br><img src="${
        msg.message?.mediaUrl || msg.mediaUrl
      }" alt="Image" loading="lazy" style="max-width: 100%; border-radius: 8px;">`;
    } else if ((msg.message?.type || msg.type) === "video") {
      text += ` <br><video controls style="max-width: 100%; border-radius: 8px;"><source src="${
        msg.message?.mediaUrl || msg.mediaUrl
      }"></video>`;
    } else if ((msg.message?.type || msg.type) === "audio") {
      text += ` <br><audio controls><source src="${
        msg.message?.mediaUrl || msg.mediaUrl
      }"></audio>`;
    } else {
      text += ` <br><a href="${
        msg.message?.mediaUrl || msg.mediaUrl
      }" target="_blank" rel="noopener">📎 ${
        msg.message?.type || msg.type || "File"
      }</a>`;
    }

    // Add timestamp
    const timestamp = new Date(
      msg.message?.timestamp || msg.timestamp || Date.now()
    ).toLocaleTimeString();
    text += ` <small class="timestamp">${timestamp}</small>`;

    div.className += isOwn ? " own-message" : " partner-message";
    div.style.textAlign = isOwn ? "right" : "left";
    div.innerHTML = text;

    // Add edit/delete buttons for own messages
    if (isOwn && !(msg.message?.deleted || msg.deleted)) {
      const editBtn = document.createElement("button");
      editBtn.textContent = "✏️";
      editBtn.className = "edit-btn";
      editBtn.onclick = () => {
        document.getElementById("messageInput").value =
          msg.message?.content || msg.content || "";
        document.getElementById("messageInput").placeholder =
          "Edit your message...";
        editingMessageId = msg._id;
      };

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑️";
      deleteBtn.className = "delete-btn";
      deleteBtn.onclick = () => {
        if (confirm("Are you sure you want to delete this message?")) {
          socket.emit("delete_message", { messageId: msg._id });
        }
      };

      div.appendChild(editBtn);
      div.appendChild(deleteBtn);
    }

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  } catch (error) {
    console.error("Error rendering message:", error);
  }
}

function renderEditedMessage({ messageId, message }) {
  try {
    const msgElement = document.getElementById(`msg-${messageId}`);
    if (msgElement) {
      const currentUserId = localStorage.getItem("userId");
      const isOwn = message.sender === currentUserId;

      let text = isOwn ? `� You:` : `🔵 Anonymous:`;
      text += ` ${message.content} <small><em>(edited)</em></small>`;

      const timestamp = new Date(message.timestamp).toLocaleTimeString();
      text += ` <small class="timestamp">${timestamp}</small>`;

      // Update content but preserve buttons
      const existingButtons = msgElement.querySelectorAll(
        ".edit-btn, .delete-btn"
      );
      msgElement.innerHTML = text;
      existingButtons.forEach((btn) => msgElement.appendChild(btn));
    }
  } catch (error) {
    console.error("Error rendering edited message:", error);
  }
}

function markMessageDeleted({ message }) {
  try {
    const msgElement = document.getElementById(`msg-${message._id}`);
    if (msgElement) {
      const currentUserId = localStorage.getItem("userId");
      const isOwn = message.sender === currentUserId;

      let text = isOwn ? `🟢 You:` : `🔵 Anonymous:`;
      text += ` <em>[This message was deleted]</em>`;

      const timestamp = new Date(message.timestamp).toLocaleTimeString();
      text += ` <small class="timestamp">${timestamp}</small>`;

      msgElement.innerHTML = text;
      msgElement.style.opacity = "0.6";
    }
  } catch (error) {
    console.error("Error marking message as deleted:", error);
  }
}
