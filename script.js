const DB_KEY = "fsale_database_v1";
const THEME_KEY = "fsale_theme";
const ADMIN_SESSION_KEY = "fsale_admin_session_v1";
const USER_SESSION_KEY = "fsale_user_session_v1";
const ACTIVE_SECTION_KEY = "fsale_active_section";
const OWNED_ACCOUNTS_KEY = "fsale_owned_accounts_v1";

const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" 
    ? "http://localhost:3000/api" 
    : "/api";
const REMOTE_DB_URL = `${API_BASE}/database`;
const MESSAGES_URL = `${API_BASE}/messages`;
const PROMOTE_URL = `${API_BASE}/users/promote`;

const defaultDatabase = {
  users: [
    {
      id: "owner-timur",
      login: "Timur",
      passwordHash: "386d5796526ca17bd7dfea3799105e50cbdd300eae4f4b9a798127dc9903bac5",
      name: "Timur",
      role: "admin",
      createdAt: new Date().toISOString(),
    },
  ],
  accounts: [],
  messages: []
};

const accountList = document.querySelector("#accountList");
const searchInput = document.querySelector("#searchInput");
const sellForm = document.querySelector("#sellForm");
const accountImage = document.querySelector("#accountImage");
const imagePreview = document.querySelector("#imagePreview");
const filters = document.querySelectorAll(".filter");
const modal = document.querySelector("#buyModal");
const modalContent = document.querySelector("#modalContent");
const closeModal = document.querySelector("#closeModal");
const themeToggle = document.querySelector("#themeToggle");
const navButtons = document.querySelectorAll("[data-section]");
const pageViews = document.querySelectorAll(".page-view");
const adminNavButton = document.querySelector("#adminNavButton");
const openLogin = document.querySelector("#openLogin");
const loginModal = document.querySelector("#loginModal");
const closeLogin = document.querySelector("#closeLogin");
const loginError = document.querySelector("#loginError");
const registerError = document.querySelector("#registerError");
const userLogin = document.querySelector("#userLogin");
const userRegister = document.querySelector("#userRegister");
const authTabs = document.querySelectorAll("[data-auth-mode]");
const adminAccounts = document.querySelector("#adminAccounts");
const adminName = document.querySelector("#adminName");
const logoutAdmin = document.querySelector("#logoutAdmin");
const logoutUser = document.querySelector("#logoutUser");
const accountName = document.querySelector("#accountName");
const statsAccounts = document.querySelector("#statsAccounts");
const statsUsers = document.querySelector("#statsUsers");
const statsStorage = document.querySelector("#statsStorage");

const staffManagement = document.querySelector("#staffManagement");
const staffList = document.querySelector("#staffList");
const promoteForm = document.querySelector("#promoteForm");
const banForm = document.querySelector("#banForm");
const broadcastForm = document.querySelector("#broadcastForm");

// Chat elements
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatTitle = document.querySelector("#chat-title");
const chatType = document.querySelector("#chatType");
const chatList = document.querySelector("#chatList");

// Admin tools
const superAdminTools = document.querySelector("#superAdminTools");

let currentFilter = "all";
let database = defaultDatabase;
let currentUser = restoreUserSession();
let currentAdmin = restoreAdminSession();
let isRemoteDatabaseReady = false;
let pendingSectionAfterLogin = null;
let chatPollingInterval = null;
let currentChatId = "general";
const profileNavButton = document.querySelector("#profileNavButton");
const profName = document.querySelector("#profName");
const profLogin = document.querySelector("#profLogin");
const profRole = document.querySelector("#profRole");
const profTg = document.querySelector("#profTg");
const profDate = document.querySelector("#profDate");

let allMessages = [];

const LAST_SEEN_KEY = "tide_last_seen_msg";
const chatBadge = document.querySelector("#chatBadge");
let lastSeenMsgIds = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || "{}");

async function init() {
    try {
        await syncRemoteDatabase();
    } catch (e) {
        console.error("Initial sync failed", e);
    }
    updateStats();
    syncAccountUi();
    renderAccounts();
    refreshIcons();
    if (currentAdmin) setAdminSession(currentAdmin);
    
    const savedSection = localStorage.getItem(ACTIVE_SECTION_KEY);
    if (savedSection && (savedSection !== "admin" || currentAdmin)) {
        showSection(savedSection);
    } else {
        showSection("home");
    }

    // Auto-sync database every 10 seconds
    setInterval(async () => {
        try {
            await syncRemoteDatabase();
            renderAccounts();
            updateStats();
            if (currentUser) {
                // If user was banned while online
                const updatedUser = database.users.find(u => u.id === currentUser.id);
                if (updatedUser && updatedUser.banned) {
                    clearUserSession();
                    location.reload();
                }
            }
        } catch (e) {}
    }, 10000);
}

function showSection(sectionName) {
  if (sectionName === "admin" && !currentAdmin) {
    pendingSectionAfterLogin = "admin";
    openLoginModal("login");
    return;
  }

  if (sectionName === "sell" && !currentUser) {
    pendingSectionAfterLogin = "sell";
    openLoginModal("register");
    return;
  }

  if (sectionName === "profile" && !currentUser) {
    pendingSectionAfterLogin = "profile";
    openLoginModal("login");
    return;
  }

  pageViews.forEach((section) => {
    section.classList.toggle("active", section.dataset.page === sectionName);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionName);
  });

  localStorage.setItem(ACTIVE_SECTION_KEY, sectionName);
  
  if (sectionName === "chat") {
      startChatPolling();
      if (window.innerWidth <= 768) {
          document.querySelector(".chat-layout").classList.add("show-list");
      }
  } else {
      stopChatPolling();
  }

  if (sectionName === "profile") {
      renderProfile();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    } else {
        // Retry a few times if lucide is still loading
        let retries = 0;
        const interval = setInterval(() => {
            if (window.lucide) {
                window.lucide.createIcons();
                clearInterval(interval);
            }
            if (++retries > 10) clearInterval(interval);
        }, 300);
    }
}

function createId() {
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function loadRemoteDatabase() {
  const response = await fetch(REMOTE_DB_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Server DB unavailable");
  return await response.json();
}

async function saveRemoteDatabase(data) {
  const response = await fetch(REMOTE_DB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to save to server DB");
}

async function syncRemoteDatabase() {
  try {
    database = await loadRemoteDatabase();
    isRemoteDatabaseReady = true;
    statsStorage.textContent = "online (file)";
    renderAccounts();
    renderAdminAccounts();
    updateStats();
    if (pageViews[3] && pageViews[3].classList.contains("active")) fetchMessages();
  } catch (error) {
    isRemoteDatabaseReady = false;
    statsStorage.textContent = "offline (local)";
    console.error(error);
  }
}

function restoreUserSession() {
  const saved = localStorage.getItem(USER_SESSION_KEY);
  return saved ? JSON.parse(saved) : null;
}

function setUserSession(user) {
  currentUser = user;
  localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
  syncAccountUi();
}

function clearUserSession() {
  currentUser = null;
  localStorage.removeItem(USER_SESSION_KEY);
  syncAccountUi();
}

function syncAccountUi() {
  if (currentUser) {
    accountName.textContent = currentUser.name || currentUser.login;
    accountName.classList.remove("hidden");
    logoutUser.classList.remove("hidden");
    openLogin.classList.add("hidden");
    profileNavButton.classList.remove("hidden");
    
    // Timur special tools
    if (currentUser.login.toLowerCase() === "timur") {
        superAdminTools.classList.remove("hidden");
        staffManagement.classList.remove("hidden");
        renderStaffList();
    } else {
        superAdminTools.classList.add("hidden");
        staffManagement.classList.add("hidden");
    }
    return;
  }

  accountName.textContent = "";
  accountName.classList.add("hidden");
  logoutUser.classList.add("hidden");
  openLogin.classList.remove("hidden");
  profileNavButton.classList.add("hidden");
  superAdminTools.classList.add("hidden");
  staffManagement.classList.add("hidden");
}

function renderStaffList() {
    if (!currentUser || currentUser.login.toLowerCase() !== "timur") return;
    const admins = database.users.filter(u => u.role === 'admin' && u.login !== 'Timur');
    
    staffList.innerHTML = admins.length ? admins.map(u => `
        <div class="admin-row">
            <div>
                <strong>${u.name}</strong>
                <span>@${u.login}</span>
            </div>
            <button class="button secondary small" onclick="demoteUser('${u.login}')">Снять с админки</button>
        </div>
    `).join("") : '<p class="empty">Других админов нет</p>';
}

window.demoteUser = async (login) => {
    if (!confirm(`Вы уверены, что хотите снять ${login} с админки?`)) return;
    try {
        const response = await fetch(`${API_BASE}/users/demote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login })
        });
        if (response.ok) {
            await syncRemoteDatabase();
            renderStaffList();
        }
    } catch (e) {
        alert("Ошибка сервера");
    }
};

function renderProfile() {
    if (!currentUser) return;
    profName.textContent = currentUser.name;
    profLogin.textContent = currentUser.login;
    profRole.textContent = currentUser.role === 'admin' ? 'Администратор' : 'Пользователь';
    profRole.className = `value badge ${currentUser.role}`;
    profTg.textContent = currentUser.telegram || 'Не указан';
    
    const linkBtn = document.querySelector("#linkTgBtn");
    if (linkBtn) {
        linkBtn.textContent = currentUser.telegram ? "Изменить" : "Привязать";
    }

    profDate.textContent = new Date(currentUser.createdAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

window.startProfileLinking = async () => {
    const tg = prompt("Введите ваш Telegram никнейм (без @):", currentUser.telegram || "");
    if (!tg) return;
    
    try {
        const response = await fetch(`${API_BASE}/auth/request-link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: currentUser.login, telegram: tg })
        });
        const result = await response.json();
        if (result.success) {
            setAuthMode("register"); // This hides other forms
            currentPendingLogin = currentUser.login;
            loginModal.showModal();
            showVerificationStep();
        }
    } catch (e) {
        alert("Ошибка сервера");
    }
};

function restoreAdminSession() {
  const saved = localStorage.getItem(ADMIN_SESSION_KEY);
  return saved ? JSON.parse(saved) : null;
}

function setAdminSession(admin) {
  currentAdmin = admin;
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(admin));
  adminName.textContent = admin.name;
  adminNavButton.classList.remove("hidden");
  renderAdminAccounts();
}

function clearAdminSession() {
  currentAdmin = null;
  localStorage.removeItem(ADMIN_SESSION_KEY);
  adminNavButton.classList.add("hidden");
  syncAccountUi();
}

function getOwnedAccountIds() {
  const saved = localStorage.getItem(OWNED_ACCOUNTS_KEY);
  return saved ? JSON.parse(saved) : [];
}

function rememberOwnedAccount(accountId) {
  const ids = getOwnedAccountIds();
  localStorage.setItem(OWNED_ACCOUNTS_KEY, JSON.stringify([...new Set([accountId, ...ids])]));
}

function ownsAccount(account) {
  if (currentUser && account.ownerId === currentUser.id) return true;
  return getOwnedAccountIds().includes(account.id);
}

async function deleteAccount(accountId) {
  database.accounts = database.accounts.filter((a) => a.id !== accountId);
  await saveRemoteDatabase(database);
  renderAccounts();
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function normalizeLogin(login) {
  return login.trim().toLowerCase();
}

// Improved image quality
function readImage(file) {
  if (!file || !file.size) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85)); // Higher quality
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function updateStats() {
  statsAccounts.textContent = formatNumber(database.accounts.length);
  statsUsers.textContent = formatNumber(database.users.length);
}

function getFilteredAccounts() {
  const query = searchInput.value.trim().toLowerCase();
  return database.accounts.filter((account) => {
    const matchesQuery = [account.title, account.description, account.seller]
      .join(" ")
      .toLowerCase()
      .includes(query);
    return matchesQuery;
  });
}

function renderAccounts() {
  const visibleAccounts = getFilteredAccounts();
  if (!visibleAccounts.length) {
    accountList.innerHTML = '<p class="empty">Пока нет лотов на продаже.</p>';
    return;
  }

  accountList.innerHTML = visibleAccounts
    .map(
      (account) => `
        <article class="card">
          <div class="card-art ${account.image ? "has-image" : ""}">
            ${account.image ? `<img src="${account.image}" loading="lazy" />` : `<span>БЕЗ ФОТО</span>`}
          </div>
          <div class="card-head">
            <div>
              <h3>${account.title}</h3>
              <p class="card-meta">Лот #${account.id.slice(0, 8)}</p>
            </div>
          </div>
          <div class="card-desc">${account.description || ""}</div>
          <div class="price-row">
            <div>
              <span class="seller">${account.ownerName || "Аноним"}</span>
              <div class="price">${formatNumber(account.price)} ₽</div>
            </div>
            <div class="card-actions">
              ${ownsAccount(account) ? `<button class="button danger" onclick="confirmDelete('${account.id}')"><i data-lucide="trash-2"></i></button>` : ""}
              <button class="button primary" onclick="openBuyModal('${account.id}')">Купить</button>
            </div>
          </div>
        </article>`
    )
    .join("");
  refreshIcons();
}

window.confirmDelete = async (id) => {
    if (confirm("Удалить этот лот?")) {
        await deleteAccount(id);
    }
};

function renderAdminAccounts() {
  if (!currentAdmin) return;
  adminAccounts.innerHTML = database.accounts.map(a => `
    <div class="admin-row">
        <div><strong>${a.title}</strong><br><small>${a.ownerName} - ${a.price} ₽</small></div>
        <button class="icon-button" onclick="confirmDelete('${a.id}')"><i data-lucide="trash-2"></i></button>
    </div>
  `).join("") || '<p class="empty">Нет лотов</p>';
  refreshIcons();
}

function openBuyModal(id) {
  const a = database.accounts.find((i) => i.id === id);
  if (!a) return;
  modalContent.innerHTML = `
    ${a.image ? `<img class="modal-image" src="${a.image}" />` : ""}
    <h3>${a.title}</h3>
    <div class="modal-desc">${a.description}</div>
    <p class="card-meta">Цена: ${formatNumber(a.price)} ₽</p>
    <button class="button primary wide" onclick="openPrivateChat('${a.id}')">Перейти в чат по товару</button>
  `;
  modal.showModal();
  refreshIcons();
}


// Chat logic
async function startChatPolling() {
    if (chatPollingInterval) return;
    fetchMessages();
    chatPollingInterval = setInterval(fetchMessages, 3000);
}

function stopChatPolling() {
    clearInterval(chatPollingInterval);
    chatPollingInterval = null;
}

async function fetchMessages() {
    try {
        const response = await fetch(`${MESSAGES_URL}?all=true`);
        allMessages = await response.json();
        console.log("Fetched messages:", allMessages);
        renderChatList();
        renderMessages();
        updateChatBadge();
    } catch (e) {
        console.error("Chat fetch error", e);
    }
}

function updateChatBadge() {
    if (!currentUser) return;
    let unreadCount = 0;
    
    allMessages.forEach(m => {
        if (m.lotId && m.lotId.startsWith("private_")) {
            const parts = m.lotId.split("_");
            if (parts.includes(currentUser.id)) {
                const lastSeenId = lastSeenMsgIds[m.lotId] || "0";
                if (m.id > lastSeenId && m.userId !== currentUser.id) {
                    unreadCount++;
                }
            }
        }
    });
    
    chatBadge.textContent = unreadCount;
    chatBadge.classList.toggle("hidden", unreadCount === 0);
}

function renderChatList() {
    const userChats = new Map();
    
    // Always add general chat
    userChats.set("general", {
        id: "general",
        name: "Общий чат",
        type: "Общение",
        lastMsg: allMessages.filter(m => m.lotId === "general").pop()?.text || "Сообщений нет"
    });
    
    // Private chats (only if logged in)
    if (currentUser) {
        allMessages.forEach(m => {
            try {
                if (m && typeof m.lotId === 'string' && m.lotId.startsWith("private_")) {
                    const parts = m.lotId.split("_");
                    if (parts.length === 3) {
                        const [, id1, id2] = parts;
                        if (id1 === currentUser.id || id2 === currentUser.id) {
                            const otherId = id1 === currentUser.id ? id2 : id1;
                            const otherUser = database.users.find(u => u.id === otherId);
                            const otherName = otherUser ? otherUser.name : "Пользователь";
                            if (!userChats.has(m.lotId)) {
                                userChats.set(m.lotId, { id: m.lotId, name: otherName, type: "Личный чат", lastMsg: m.text || "" });
                            } else {
                                userChats.get(m.lotId).lastMsg = m.text || "";
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Error processing message for chat list", m, err);
            }
        });
    }

    chatList.innerHTML = Array.from(userChats.values()).map(c => `
        <div class="chat-item ${currentChatId === c.id ? 'active' : ''}" onclick="switchToChat('${c.id}', '${c.name}', '${c.type}')">
            <span class="name">${c.name}</span>
            <span class="last-msg">${c.lastMsg}</span>
        </div>
    `).join("");
}

window.switchToChat = (id, name, type) => {
    currentChatId = id;
    chatTitle.textContent = name;
    chatType.textContent = type;
    document.querySelector(".chat-layout").classList.remove("show-list");
    renderChatList();
    renderMessages();
};

window.goBackToChatList = () => {
    document.querySelector(".chat-layout").classList.add("show-list");
};

function renderMessages() {
    const filtered = allMessages.filter(m => m.lotId === currentChatId);
    console.log(`Rendering ${filtered.length} messages for chat ${currentChatId}`);
    
    // Mark as seen
    if (filtered.length > 0 && currentChatId.startsWith("private_")) {
        const latestId = filtered[filtered.length - 1].id;
        if (!lastSeenMsgIds[currentChatId] || latestId > lastSeenMsgIds[currentChatId]) {
            lastSeenMsgIds[currentChatId] = latestId;
            localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(lastSeenMsgIds));
            updateChatBadge();
        }
    }

    const html = filtered.map(m => `
        <div class="chat-message ${currentUser && m.userId === currentUser.id ? 'own' : 'other'}" data-msg-id="${m.id}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <span class="user">${m.userName}</span>
                ${currentUser && currentUser.role === 'admin' ? `
                    <button class="icon-button" onclick="deleteMessage('${m.id}')" style="padding: 2px; height: auto; opacity: 0.5;">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                    </button>
                ` : ''}
            </div>
            <div class="msg-text">${m.text}</div>
            <span class="time">${new Date(m.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
    `).join("");
    const shouldScroll = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 100;
    chatMessages.innerHTML = html;
    if (shouldScroll) chatMessages.scrollTop = chatMessages.scrollHeight;
    refreshIcons();
}

window.deleteMessage = async (id) => {
    if (!confirm("Удалить это сообщение?")) return;
    try {
        const response = await fetch(`${API_BASE}/messages/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        });
        if (response.ok) {
            fetchMessages();
        }
    } catch (e) {
        alert("Ошибка удаления");
    }
};

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) {
        pendingSectionAfterLogin = "chat";
        return openLoginModal("register");
    }
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    try {
        await fetch(MESSAGES_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                lotId: currentChatId,
                userId: currentUser.id,
                userName: currentUser.name,
                text: text
            })
        });
        fetchMessages();
    } catch (e) {
        alert("Ошибка отправки сообщения");
    }
});

window.openPrivateChat = (sellerId) => {
    if (!currentUser) {
        pendingSectionAfterLogin = "chat";
        return openLoginModal("register");
    }
    if (sellerId === currentUser.id) return alert("Это ваш товар!");
    const ids = [currentUser.id, sellerId].sort();
    currentChatId = `private_${ids[0]}_${ids[1]}`;
    const seller = database.users.find(u => u.id === sellerId);
    
    modal.close();
    showSection("chat");
    switchToChat(currentChatId, seller ? seller.name : "Продавец", "Личный чат");
};

// Admin promotion
promoteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = promoteForm.elements.promote_login.value.trim();
    try {
        const response = await fetch(PROMOTE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login })
        });
        if (response.ok) {
            alert(`Пользователь ${login} теперь админ!`);
            promoteForm.reset();
            await syncRemoteDatabase();
            renderStaffList();
        } else {
            alert("Пользователь не найден");
        }
    } catch (e) {
        alert("Ошибка сервера");
    }
});

banForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = banForm.elements.ban_login.value.trim();
    try {
        const response = await fetch(`${API_BASE}/users/ban`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login })
        });
        const result = await response.json();
        if (result.success) {
            alert(`Статус блокировки ${login} изменен. Бан: ${result.banned}`);
            banForm.reset();
            syncRemoteDatabase();
        } else {
            alert(result.message);
        }
    } catch (e) {
        alert("Ошибка сервера");
    }
});

broadcastForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = broadcastForm.elements.broadcast_text.value.trim();
    if (!text) return;
    try {
        await fetch(MESSAGES_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                lotId: "general",
                userId: "system",
                userName: "📢 ОБЪЯВЛЕНИЕ",
                text: `<b>${text}</b>`
            })
        });
        alert("Объявление отправлено в общий чат!");
        broadcastForm.reset();
        fetchMessages();
    } catch (e) {
        alert("Ошибка отправки");
    }
});

// Event Listeners
navButtons.forEach(b => b.addEventListener("click", () => {
    if (b.dataset.section === "chat") {
        currentChatId = "general";
        chatTitle.textContent = "Общий чат";
        chatType.textContent = "Общение";
    }
    showSection(b.dataset.section);
}));
searchInput.addEventListener("input", renderAccounts);

sellForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(sellForm);
    const id = createId();
    const image = await readImage(data.get("image"));
    
    const newLot = {
        id,
        title: data.get("title").trim(),
        description: data.get("description").trim(),
        price: Number(data.get("price")),
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        image,
        createdAt: new Date().toISOString()
    };
    
    database.accounts.unshift(newLot);
    try {
        await saveRemoteDatabase(database);
        rememberOwnedAccount(id);
        sellForm.reset();
        imagePreview.classList.add("hidden");
        showSection("market");
        renderAccounts();
    } catch (err) {
        alert("Ошибка сохранения");
    }
});

accountImage.addEventListener("change", async () => {
    const file = accountImage.files[0];
    if (!file) return;
    const dataUrl = await readImage(file);
    imagePreview.style.backgroundImage = `url(${dataUrl})`;
    imagePreview.classList.remove("hidden");
});

userLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(userLogin);
    const login = normalizeLogin(data.get("user_login"));
    const hash = await hashText(data.get("user_key"));
    
    const user = database.users.find(u => normalizeLogin(u.login) === login && u.passwordHash === hash);
    if (user) {
        if (user.banned) {
            loginError.innerHTML = `
                <div style="text-align: left; line-height: 1.6; font-size: 13px;">
                    <p>Здравствуйте.</p>
                    <p>К сожалению, на данный момент мы видим, что ваш аккаунт был заблокирован администрацией платформы, в связи с чем продолжение общения или проведение каких-либо операций через него невозможно.</p>
                    <p>Рекомендуем вам обратиться в службу поддержки сервиса для уточнения причин блокировки и возможных способов восстановления доступа. Обычно поддержка может предоставить более подробную информацию и помочь разобраться в ситуации.</p>
                    <p>Со своей стороны благодарим вас за ранее проявленный интерес и взаимодействие. Надеемся, что вопрос с аккаунтом удастся решить в ближайшее время.</p>
                    <p>Благодарим за понимание.</p>
                </div>
            `;
            loginError.classList.remove("hidden");
            return;
        }
        setUserSession(user);
        if (user.role === "admin") setAdminSession(user);
        loginModal.close();
        showSection(pendingSectionAfterLogin || "market");
    } else {
        loginError.textContent = "Неверный логин или пароль.";
        loginError.classList.remove("hidden");
    }
});

// Auth & Verification elements
const verificationStep = document.querySelector("#verificationStep");
const verificationForm = document.querySelector("#verificationForm");
const verificationCodeInput = document.querySelector("#verificationCodeInput");
let currentPendingLogin = null;
let isRecoveryMode = false;

async function startPasswordRecovery() {
    const login = normalizeLogin(userLogin.elements.user_login.value);
    if (!login) return alert("Введите логин");
    try {
        const response = await fetch(`${API_BASE}/auth/recover-init?login=${login}`);
        const result = await response.json();
        if (result.success) {
            currentPendingLogin = login;
            isRecoveryMode = true;
            showVerificationStep();
        } else {
            alert(result.message);
        }
    } catch (e) {
        alert("Ошибка сервера");
    }
}

userRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(userRegister);
    const login = normalizeLogin(data.get("register_login"));
    
    if (database.users.some(u => normalizeLogin(u.login) === login)) {
        return registerError.classList.remove("hidden");
    }
    
    const userData = {
        login,
        passwordHash: await hashText(data.get("register_key")),
        name: data.get("register_name").trim(),
        telegram: data.get("register_tg").trim(),
        role: "user",
        createdAt: new Date().toISOString()
    };
    
    try {
        const response = await fetch(`${API_BASE}/auth/register-pending`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userData)
        });
        const result = await response.json();
        
        if (result.success) {
            currentPendingLogin = login;
            showVerificationStep();
        } else {
            alert("Ошибка при регистрации");
        }
    } catch (err) {
        alert("Ошибка сервера");
    }
});

function showVerificationStep() {
    userRegister.classList.add("hidden");
    userLogin.classList.add("hidden");
    verificationStep.classList.remove("hidden");
    
    const vTitle = document.querySelector("#verificationTitle");
    const vText = document.querySelector("#verificationText");
    const codeLabel = verificationCodeInput.parentElement;
    const passLabel = document.querySelector("#recoveryPassLabel");
    
    if (isRecoveryMode) {
        vTitle.textContent = "Восстановление пароля";
        vText.textContent = "Нажмите кнопку 'Восстановление пароля' в боте.";
        codeLabel.classList.remove("hidden");
        passLabel.classList.add("hidden");
    } else {
        vTitle.textContent = "Подтверждение Telegram";
        vText.textContent = "Нажмите кнопку 'Привязать аккаунт' в боте.";
        codeLabel.classList.remove("hidden");
        passLabel.classList.add("hidden");
    }
}

verificationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = verificationCodeInput.value.trim();
    const passLabel = document.querySelector("#recoveryPassLabel");
    const codeLabel = verificationCodeInput.parentElement;
    
    if (!code || !currentPendingLogin) return;
    
    try {
        if (isRecoveryMode) {
            if (passLabel.classList.contains("hidden")) {
                // Step 1: Verify code
                const response = await fetch(`${API_BASE}/auth/verify-code?login=${currentPendingLogin}&code=${code}`);
                const result = await response.json();
                if (result.success) {
                    // Show password input
                    codeLabel.classList.add("hidden");
                    passLabel.classList.remove("hidden");
                    document.querySelector("#verificationText").textContent = "Теперь введите новый пароль.";
                    // We don't clear code yet, we need it for the final submit
                } else {
                    alert(result.message || "Неверный код");
                }
            } else {
                // Step 2: Set new password
                const newPass = document.querySelector("#recoveryNewPass").value;
                if (newPass.length < 4) return alert("Пароль слишком короткий");
                const hash = await hashText(newPass);
                const response = await fetch(`${API_BASE}/auth/verify-recovery`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: currentPendingLogin, code, passwordHash: hash })
                });
                const result = await response.json();
                if (result.success) {
                    alert("Пароль успешно изменен!");
                    setAuthMode("login");
                } else {
                    alert(result.message || "Ошибка");
                }
            }
        } else {
            // Standard registration/linking
            const response = await fetch(`${API_BASE}/auth/verify-code?login=${currentPendingLogin}&code=${code}`);
            const result = await response.json();
            
            if (result.success) {
                setUserSession(result.user);
                loginModal.close();
                if (localStorage.getItem(ACTIVE_SECTION_KEY) === "profile") renderProfile();
            } else {
                alert(result.message || "Неверный код");
            }
        }
    } catch (e) {
        alert("Ошибка подтверждения");
    }
});

logoutUser.addEventListener("click", () => {
    clearUserSession();
    clearAdminSession();
    showSection("home");
});

themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    
    // Switch icon
    themeToggle.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}"></i>`;
    refreshIcons();
});

if (localStorage.getItem(THEME_KEY) === "dark") {
    document.body.classList.add("dark");
    themeToggle.innerHTML = `<i data-lucide="sun"></i>`;
}

closeLogin.addEventListener("click", () => loginModal.close());
openLogin.addEventListener("click", () => openLoginModal());
closeModal.addEventListener("click", () => modal.close());

authTabs.forEach(b => b.addEventListener("click", () => {
    setAuthMode(b.dataset.authMode);
    authTabs.forEach(t => t.classList.toggle("active", t === b));
}));

function openLoginModal(mode = "login") {
    setAuthMode(mode);
    loginModal.showModal();
}

function setAuthMode(mode) {
    userLogin.classList.toggle("hidden", mode !== "login");
    userRegister.classList.toggle("hidden", mode !== "register");
    verificationStep.classList.add("hidden");
    document.querySelector("#recoveryPassLabel").classList.add("hidden");
    currentPendingLogin = null;
    isRecoveryMode = false;
    verificationCodeInput.value = "";
}


function openBuyModal(id) {
  const a = database.accounts.find((i) => i.id === id);
  if (!a) return;
  modalContent.innerHTML = `
    ${a.image ? `<img class="modal-image" src="${a.image}" />` : ""}
    <h3>${a.title}</h3>
    <div class="modal-desc">${a.description}</div>
    <p class="card-meta">Цена: ${formatNumber(a.price)} ₽</p>
    <button class="button primary wide" onclick="openPrivateChat('${a.ownerId}')">Перейти в чат к продавцу</button>
  `;
  modal.showModal();
  refreshIcons();
}

init();
