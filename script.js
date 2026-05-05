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

// Chat elements
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatTitle = document.querySelector("#chat-title");
const chatType = document.querySelector("#chatType");
const backToGeneralChat = document.querySelector("#backToGeneralChat");

// Admin tools
const superAdminTools = document.querySelector("#superAdminTools");
const promoteForm = document.querySelector("#promoteForm");

let currentFilter = "all";
let database = defaultDatabase;
let currentUser = restoreUserSession();
let currentAdmin = restoreAdminSession();
let isRemoteDatabaseReady = false;
let pendingSectionAfterLogin = null;
let chatPollingInterval = null;
let currentChatId = "general";

async function init() {
    try {
        await syncRemoteDatabase();
    } catch (e) {
        console.error("Initial sync failed", e);
    }
    updateStats();
    syncAccountUi();
    renderAccounts();
    if (currentAdmin) setAdminSession(currentAdmin);
    
    const savedSection = localStorage.getItem(ACTIVE_SECTION_KEY);
    if (savedSection && (savedSection !== "admin" || currentAdmin)) {
        showSection(savedSection);
    } else {
        showSection("home");
    }
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

  pageViews.forEach((section) => {
    section.classList.toggle("active", section.dataset.page === sectionName);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionName);
  });

  localStorage.setItem(ACTIVE_SECTION_KEY, sectionName);
  
  if (sectionName === "chat") {
      startChatPolling();
  } else {
      stopChatPolling();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
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
    
    // Timur special tools
    if (currentUser.login.toLowerCase() === "timur") {
        superAdminTools.classList.remove("hidden");
    } else {
        superAdminTools.classList.add("hidden");
    }
    return;
  }

  accountName.textContent = "";
  accountName.classList.add("hidden");
  logoutUser.classList.add("hidden");
  openLogin.classList.remove("hidden");
  superAdminTools.classList.add("hidden");
}

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

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
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
        const response = await fetch(`${MESSAGES_URL}?lotId=${currentChatId}`);
        const messages = await response.json();
        renderMessages(messages);
    } catch (e) {
        console.error("Chat fetch error", e);
    }
}

function renderMessages(messages) {
    const html = messages.map(m => `
        <div class="chat-message ${currentUser && m.userId === currentUser.id ? 'own' : 'other'}">
            <span class="user">${m.userName}</span>
            ${m.text}
            <span class="time">${new Date(m.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
    `).join("");
    const shouldScroll = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 50;
    chatMessages.innerHTML = html;
    if (shouldScroll) chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return showSection("home");
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

window.openPrivateChat = (lotId) => {
    const lot = database.accounts.find(a => a.id === lotId);
    if (!lot) return;
    
    currentChatId = lotId;
    chatTitle.textContent = lot.title;
    chatType.textContent = "Чат по товару";
    backToGeneralChat.classList.remove("hidden");
    modal.close();
    showSection("chat");
};

backToGeneralChat.addEventListener("click", () => {
    currentChatId = "general";
    chatTitle.textContent = "Общий чат";
    chatType.textContent = "Общение";
    backToGeneralChat.classList.add("hidden");
    fetchMessages();
});

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
            syncRemoteDatabase();
        } else {
            alert("Пользователь не найден");
        }
    } catch (e) {
        alert("Ошибка сервера");
    }
});

// Event Listeners
navButtons.forEach(b => b.addEventListener("click", () => {
    if (b.dataset.section === "chat") {
        currentChatId = "general";
        chatTitle.textContent = "Общий чат";
        chatType.textContent = "Общение";
        backToGeneralChat.classList.add("hidden");
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
        setUserSession(user);
        if (user.role === "admin") setAdminSession(user);
        loginModal.close();
        showSection(pendingSectionAfterLogin || "market");
    } else {
        loginError.classList.remove("hidden");
    }
});

userRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(userRegister);
    const login = normalizeLogin(data.get("register_login"));
    if (database.users.some(u => normalizeLogin(u.login) === login)) {
        return registerError.classList.remove("hidden");
    }
    
    const newUser = {
        id: createId(),
        login,
        passwordHash: await hashText(data.get("register_key")),
        name: data.get("register_name").trim(),
        role: "user",
        createdAt: new Date().toISOString()
    };
    
    database.users.push(newUser);
    await saveRemoteDatabase(database);
    setUserSession(newUser);
    loginModal.close();
    showSection("market");
});

logoutUser.addEventListener("click", () => {
    clearUserSession();
    clearAdminSession();
    showSection("home");
});

themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
});

if (localStorage.getItem(THEME_KEY) === "dark") document.body.classList.add("dark");

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
}


init();
