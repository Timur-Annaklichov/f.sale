const DB_KEY = "fsale_database_v1";
const OLD_ACCOUNTS_KEY = "fsale_accounts";
const THEME_KEY = "fsale_theme";

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
};

const defaultAdmin = defaultDatabase.users[0];

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
const adminLogin = document.querySelector("#adminLogin");
const adminDashboard = document.querySelector("#adminDashboard");
const adminAccounts = document.querySelector("#adminAccounts");
const adminName = document.querySelector("#adminName");
const logoutAdmin = document.querySelector("#logoutAdmin");
const exportDb = document.querySelector("#exportDb");
const clearAccounts = document.querySelector("#clearAccounts");
const dbOutput = document.querySelector("#dbOutput");
const statsAccounts = document.querySelector("#statsAccounts");
const statsUsers = document.querySelector("#statsUsers");

let currentFilter = "all";
let currentAdmin = null;
let database = loadDatabase();

function showSection(sectionName) {
  if (sectionName === "admin" && !currentAdmin) {
    openLoginModal();
    return;
  }

  pageViews.forEach((section) => {
    section.classList.toggle("active", section.dataset.page === sectionName);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionName);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadDatabase() {
  localStorage.removeItem(OLD_ACCOUNTS_KEY);

  const saved = localStorage.getItem(DB_KEY);
  if (!saved) {
    localStorage.setItem(DB_KEY, JSON.stringify(defaultDatabase));
    return structuredClone(defaultDatabase);
  }

  try {
    const parsed = JSON.parse(saved);
    const users = Array.isArray(parsed.users) && parsed.users.length ? parsed.users : defaultDatabase.users;
    const database = {
      users: migrateUsers(users),
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    };

    localStorage.setItem(DB_KEY, JSON.stringify(database));
    return database;
  } catch {
    localStorage.setItem(DB_KEY, JSON.stringify(defaultDatabase));
    return structuredClone(defaultDatabase);
  }
}

function migrateUsers(users) {
  const withoutOldAdmin = users.filter((user) => user.login.toLowerCase() !== "admin");
  const otherUsers = withoutOldAdmin
    .filter((user) => user.login !== defaultAdmin.login)
    .map(({ password, ...user }) => user);

  return [defaultAdmin, ...otherUsers];
}

function saveDatabase() {
  localStorage.setItem(DB_KEY, JSON.stringify(database));
  updateStats();
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function normalizeContact(contact) {
  const cleanContact = contact.trim();
  return cleanContact.startsWith("@") ? cleanContact : `@${cleanContact}`;
}

function readImage(file) {
  if (!file || !file.size) return Promise.resolve("");

  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Выбери файл картинки."));
  }

  if (file.size > 6 * 1024 * 1024) {
    return Promise.reject(new Error("Картинка слишком большая. Максимум 6 МБ."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("Не получилось прочитать картинку.")));
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("error", () => reject(new Error("Не получилось обработать картинку.")));
      image.addEventListener("load", () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function updateStats() {
  statsAccounts.textContent = formatNumber(database.accounts.length);
  statsUsers.textContent = formatNumber(database.users.length);
}

function getFilteredAccounts() {
  const query = searchInput.value.trim().toLowerCase();

  return database.accounts.filter((account) => {
    const matchesQuery = [account.title, account.rank, account.seller, account.tag]
      .join(" ")
      .toLowerCase()
      .includes(query);

    const matchesFilter =
      currentFilter === "all" ||
      account.tag === currentFilter ||
      (currentFilter === "legendary" && account.legendary >= 10) ||
      (currentFilter === "high-trophy" && account.trophies >= 50000) ||
      (currentFilter === "budget" && account.price <= 5000);

    return matchesQuery && matchesFilter;
  });
}

function renderAccounts() {
  const visibleAccounts = getFilteredAccounts();

  if (!visibleAccounts.length) {
    accountList.innerHTML = '<p class="empty">Пока нет аккаунтов на продаже.</p>';
    renderAdminAccounts();
    refreshIcons();
    return;
  }

  accountList.innerHTML = visibleAccounts
    .map(
      (account) => `
        <article class="card">
          <div class="card-art ${account.image ? "has-image" : ""}" aria-hidden="true">
            ${
              account.image
                ? `<img src="${account.image}" alt="" loading="lazy" />`
                : `<span>Нет картинки</span>`
            }
          </div>
          <div class="card-head">
            <div>
              <h3>${account.title}</h3>
              <p class="card-meta">${formatNumber(account.trophies)} трофеев</p>
            </div>
            <span class="badge">${account.tag}</span>
          </div>
          <div class="metrics">
            <span><b>${account.brawlers}</b> бойцов</span>
            <span><b>${account.legendary}</b> легендарных</span>
            <span><b>${account.skins}</b> скинов</span>
            <span><b>${account.rank}</b> максимум</span>
          </div>
          <div class="price-row">
            <div>
              <span class="seller">${account.seller}</span>
              <div class="price">${formatNumber(account.price)} ₽</div>
            </div>
            <button class="button primary" type="button" data-buy="${account.id}">
              <i data-lucide="credit-card"></i>
              Купить
            </button>
          </div>
        </article>
      `,
    )
    .join("");

  renderAdminAccounts();
  refreshIcons();
}

function renderAdminAccounts() {
  if (!currentAdmin) return;

  if (!database.accounts.length) {
    adminAccounts.innerHTML = '<p class="empty">В базе пока нет объявлений.</p>';
    return;
  }

  adminAccounts.innerHTML = database.accounts
    .map(
      (account) => `
        <div class="admin-row">
          ${
            account.image
              ? `<img class="admin-thumb" src="${account.image}" alt="" loading="lazy" />`
              : `<span class="admin-thumb empty-thumb">IMG</span>`
          }
          <div>
            <strong>${account.title}</strong>
            <span>${formatNumber(account.trophies)} трофеев · ${formatNumber(account.price)} ₽ · ${account.seller}</span>
          </div>
          <button class="icon-button" type="button" data-delete="${account.id}" aria-label="Удалить объявление">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `,
    )
    .join("");
}

function openBuyModal(accountId) {
  const account = database.accounts.find((item) => item.id === accountId);
  if (!account) return;

  modalContent.innerHTML = `
    ${
      account.image
        ? `<img class="modal-image" src="${account.image}" alt="Картинка аккаунта ${account.title}" />`
        : ""
    }
    <h3>${account.title}</h3>
    <p class="card-meta">Свяжись с продавцом и проверь данные аккаунта перед оплатой.</p>
    <dl>
      <div><dt>Цена</dt><dd>${formatNumber(account.price)} ₽</dd></div>
      <div><dt>Продавец</dt><dd>${account.seller}</dd></div>
      <div><dt>Трофеи</dt><dd>${formatNumber(account.trophies)}</dd></div>
      <div><dt>Бойцы</dt><dd>${account.brawlers}</dd></div>
      <div><dt>Легендарные</dt><dd>${account.legendary}</dd></div>
      <div><dt>Ранг</dt><dd>${account.rank}</dd></div>
    </dl>
    <a class="button primary wide" href="https://t.me/${account.seller.replace("@", "")}" target="_blank" rel="noreferrer">
      <i data-lucide="message-circle"></i>
      Написать продавцу
    </a>
  `;

  modal.showModal();
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function clearLoginForm() {
  adminLogin.reset();
  adminLogin.elements.admin_login.value = "";
  adminLogin.elements.admin_key.value = "";
  adminLogin.classList.remove("error");
  loginError.classList.add("hidden");
}

function openLoginModal() {
  clearLoginForm();
  loginModal.showModal();
  setTimeout(clearLoginForm, 80);
  setTimeout(clearLoginForm, 250);
  refreshIcons();
}

filters.forEach((button) => {
  button.addEventListener("click", () => {
    filters.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    renderAccounts();
  });
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section);
  });
});

accountList.addEventListener("click", (event) => {
  const buyButton = event.target.closest("[data-buy]");
  if (buyButton) {
    openBuyModal(buyButton.dataset.buy);
  }
});

adminAccounts.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;

  database.accounts = database.accounts.filter((account) => account.id !== deleteButton.dataset.delete);
  saveDatabase();
  renderAccounts();
});

searchInput.addEventListener("input", renderAccounts);

accountImage.addEventListener("change", async () => {
  imagePreview.classList.add("hidden");
  imagePreview.style.backgroundImage = "";

  try {
    const image = await readImage(accountImage.files[0]);
    if (!image) return;
    imagePreview.style.backgroundImage = `url("${image}")`;
    imagePreview.classList.remove("hidden");
  } catch (error) {
    accountImage.value = "";
    alert(error.message);
  }
});

sellForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(sellForm);
  const trophies = Number(data.get("trophies"));
  const price = Number(data.get("price"));
  const brawlers = Number(data.get("brawlers"));
  let image = "";

  try {
    image = await readImage(data.get("image"));
  } catch (error) {
    alert(error.message);
    return;
  }

  if (!image) {
    alert("Добавь картинку аккаунта.");
    return;
  }

  database.accounts = [
    {
      id: createId(),
      title: data.get("title").trim(),
      trophies,
      brawlers,
      legendary: Number(data.get("legendary")),
      skins: Math.max(12, Math.round(brawlers * 1.4)),
      price,
      rank: trophies >= 50000 ? "R35" : trophies >= 30000 ? "R30" : "R25",
      seller: normalizeContact(data.get("contact")),
      tag: price <= 5000 ? "budget" : trophies >= 50000 ? "high-trophy" : "legendary",
      image,
      createdAt: new Date().toISOString(),
    },
    ...database.accounts,
  ];

  saveDatabase();
  sellForm.reset();
  imagePreview.classList.add("hidden");
  imagePreview.style.backgroundImage = "";
  currentFilter = "all";
  filters.forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
  renderAccounts();
  showSection("market");
});

adminLogin.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(adminLogin);
  const passwordHash = await hashText(data.get("admin_key"));
  const admin = database.users.find(
    (user) =>
      user.role === "admin" &&
      user.login === data.get("admin_login").trim() &&
      user.passwordHash === passwordHash,
  );

  if (!admin) {
    adminLogin.classList.add("error");
    loginError.classList.remove("hidden");
    return;
  }

  currentAdmin = admin;
  adminName.textContent = admin.name;
  adminNavButton.classList.remove("hidden");
  openLogin.classList.add("hidden");
  loginModal.close();
  clearLoginForm();
  adminLogin.classList.remove("error");
  loginError.classList.add("hidden");
  renderAdminAccounts();
  showSection("admin");
  refreshIcons();
});

logoutAdmin.addEventListener("click", () => {
  currentAdmin = null;
  adminNavButton.classList.add("hidden");
  openLogin.classList.remove("hidden");
  dbOutput.classList.add("hidden");
  showSection("home");
});

exportDb.addEventListener("click", () => {
  dbOutput.textContent = JSON.stringify(database, null, 2);
  dbOutput.classList.toggle("hidden");
});

clearAccounts.addEventListener("click", () => {
  database.accounts = [];
  saveDatabase();
  renderAccounts();
});

closeModal.addEventListener("click", () => modal.close());

openLogin.addEventListener("click", () => {
  openLoginModal();
});

closeLogin.addEventListener("click", () => {
  clearLoginForm();
  loginModal.close();
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
  themeToggle.innerHTML = document.body.classList.contains("dark")
    ? '<i data-lucide="sun"></i>'
    : '<i data-lucide="moon"></i>';
  refreshIcons();
});

if (localStorage.getItem(THEME_KEY) === "dark") {
  document.body.classList.add("dark");
  themeToggle.innerHTML = '<i data-lucide="sun"></i>';
}

updateStats();
renderAccounts();
window.addEventListener("load", refreshIcons);
