/* ─────────────────────────────────────────────
   THEME  (runs immediately — no DOM needed)
───────────────────────────────────────────── */
const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────── */
const backendBaseUrl = "https://model-tr.onrender.com";
let selectedModel    = "t1";
let attachedFiles    = [];   // { file, dataURL, base64, mimeType, type }
let autoScroll       = true;

/* ─────────────────────────────────────────────
   SUPABASE
───────────────────────────────────────────── */
const SUPABASE_URL      = "https://ctquajydjitfjhqvezfz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0cXVhanlkaml0ZmpocXZlemZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MjA1MzQsImV4cCI6MjA4MzE5NjUzNH0.3cenuqB4XffJdRQisJQhq7PS9_ybXDN7ExbsKfXx9gU";

const supabaseClient =
  typeof supabase !== "undefined"
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function formatGeminiResponse(text) {
  if (!text) return "";
  return text
    // Sanitise HTML first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // *highlighted text* → coloured strong tag (non-greedy, no cross-line match)
    .replace(/\*([^*\n]+?)\*/g, "<strong>$1</strong>")
    // Numbered steps: "1. text" → styled prefix
    .replace(/^(\d+\.\s)/gm, "<br><span class='msg-step-num'>$1</span>")
    // Paragraph breaks
    .replace(/\n\n/g, "<br><br>")
    // Single line breaks
    .replace(/\n/g, "<br>");
}

/* ── Copy toast helper ── */
function showCopyToast(msg = "Copied to clipboard") {
  let toast = document.getElementById("copyToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "copyToast";
    toast.className = "copy-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 1800);
}
async function recordRating(rating, question, answerText) {
  if (!supabaseClient) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    await supabaseClient.from("message_ratings").insert({
      user_id:        session?.user?.id ?? null,
      rating,                                      // 1 or -1
      question:       question.slice(0, 500),
      answer_snippet: answerText.slice(0, 500),
      created_at:     new Date().toISOString(),
    });
  } catch (e) { /* silent */ }
}

/* ── Append action bar below a bot bubble ── */
function addMessageActions(botRow, content, question, onRegenerate) {
  const bar = document.createElement("div");
  bar.className = "msg-actions";

  function makeBtn(svgPath, title, viewBox = "0 0 24 24") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msg-action-btn";
    btn.title = title;
    btn.innerHTML = `<svg width="18" height="18" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
    return btn;
  }

  /* Copy */
  const copyBtn = makeBtn(
    `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
    "Copy"
  );
  copyBtn.addEventListener("click", () => {
    const text = content.innerText || content.textContent;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.classList.add("copied");

      // Show tiny label under the button
      let label = copyBtn.querySelector(".copy-label");
      if (!label) {
        label = document.createElement("span");
        label.className = "copy-label";
        label.textContent = "Copied";
        copyBtn.style.position = "relative";
        copyBtn.appendChild(label);
      }
      label.classList.add("visible");
      clearTimeout(copyBtn._ct);
      copyBtn._ct = setTimeout(() => {
        copyBtn.classList.remove("copied");
        label.classList.remove("visible");
      }, 1800);
    });
  });

  /* Thumbs up */
  const thumbUpBtn = makeBtn(
    `<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>`,
    "Helpful"
  );

  /* Thumbs down */
  const thumbDownBtn = makeBtn(
    `<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>`,
    "Not helpful"
  );

  let rated = false;
  function handleRating(btn, otherBtn, value) {
    if (rated) return;
    rated = true;
    btn.classList.add(value === 1 ? "active-thumb-up" : "active-thumb-down");
    // Switch SVG from outline to solid fill
    const svg = btn.querySelector("svg");
    if (svg) { svg.setAttribute("fill", "currentColor"); svg.setAttribute("stroke", "none"); }
    otherBtn.style.opacity = "0.3";
    otherBtn.style.pointerEvents = "none";
    const answerText = content.innerText || content.textContent;
    recordRating(value, question, answerText);
  }
  thumbUpBtn.addEventListener("click",   () => handleRating(thumbUpBtn,   thumbDownBtn, 1));
  thumbDownBtn.addEventListener("click", () => handleRating(thumbDownBtn, thumbUpBtn,  -1));

  /* Regenerate */
  const regenBtn = makeBtn(
    `<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>`,
    "Regenerate"
  );
  regenBtn.addEventListener("click", () => {
    bar.classList.add("visible"); // keep visible during regen
    onRegenerate();
  });

  bar.appendChild(copyBtn);
  bar.appendChild(thumbUpBtn);
  bar.appendChild(thumbDownBtn);
  bar.appendChild(regenBtn);
  botRow.appendChild(bar);
}

function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ─────────────────────────────────────────────
   AUTH HELPERS  (used by login.html / signup.html)
───────────────────────────────────────────── */
function showAuthMessage(text, type = "error") {
  const box = document.getElementById("authMessage");
  if (!box) return;
  box.textContent = text;
  box.className   = `auth-message ${type}`;
  box.style.display = "block";
}

async function login(event) {
  event.preventDefault();
  if (!supabaseClient) return;

  const raw      = (document.getElementById("emailOrUsername") || document.getElementById("email"))?.value.trim();
  const password = document.getElementById("password")?.value;
  if (!raw || !password) { showAuthMessage("Please enter your email/username and password."); return; }

  const btn = document.getElementById("loginBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Logging in…"; }

  let email = raw;

  if (!raw.includes("@")) {
    // Username lookup — works because user_profiles has public SELECT policy
    const { data: rows } = await supabaseClient
      .from("user_profiles")
      .select("email")
      .eq("username", raw.toLowerCase())
      .limit(1);

    if (!rows || rows.length === 0) {
      showAuthMessage("No account found with that username.");
      if (btn) { btn.disabled = false; btn.textContent = "Continue"; }
      return;
    }
    email = rows[0].email;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (btn) { btn.disabled = false; btn.textContent = "Continue"; }
  if (error) {
    if (error.message.includes("Email not confirmed")) {
      showAuthMessage("Please confirm your email first. Check your inbox.");
    } else {
      showAuthMessage("Incorrect credentials. Try again.");
    }
    return;
  }
  showAuthMessage("Login successful.", "success");
  setTimeout(() => location.href = "dashboard.html", 800);
}

async function forgotPassword(event) {
  event.preventDefault();
  if (!supabaseClient) return;

  const raw = document.getElementById("forgotEmailOrUsername")?.value.trim();
  if (!raw) {
    showForgotMessage("Please enter your email or username.");
    return;
  }

  const btn = document.getElementById("sendResetBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }

  let email = raw;

  // If username provided, look up email
  if (!raw.includes("@")) {
    const { data: rows } = await supabaseClient
      .from("user_profiles")
      .select("email")
      .eq("username", raw.toLowerCase())
      .limit(1);

    if (!rows || rows.length === 0) {
      showForgotMessage("No account found with that username.");
      if (btn) { btn.disabled = false; btn.textContent = "Send Reset Link"; }
      return;
    }
    email = rows[0].email;
  }

  // Send password reset email
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password.html"
  });

  if (btn) { btn.disabled = false; btn.textContent = "Send Reset Link"; }

  if (error) {
    showForgotMessage("Failed to send reset email. Please try again.");
    return;
  }

  showForgotMessage("Password reset link sent! Check your email.", "success");
  setTimeout(() => {
    closeForgotPasswordModal();
    document.getElementById("forgotEmailOrUsername").value = "";
  }, 2000);
}

function showForgotMessage(msg, type = "error") {
  const el = document.getElementById("forgotMessage");
  if (!el) return;
  el.textContent = msg;
  el.className = "auth-message " + type;
}

function openForgotPasswordModal() {
  const modal = document.getElementById("forgotPasswordModal");
  if (modal) {
    modal.style.display = "flex";
    document.getElementById("forgotMessage").className = "auth-message";
  }
}

function closeForgotPasswordModal() {
  const modal = document.getElementById("forgotPasswordModal");
  if (modal) {
    modal.style.display = "none";
    document.getElementById("forgotMessage").className = "auth-message";
  }
}

async function signup(event) {
  event.preventDefault();
  if (!supabaseClient) return;

  const email       = document.getElementById("email")?.value.trim();
  const password    = document.getElementById("password")?.value;
  const fullName    = document.getElementById("fullName")?.value.trim()    || "";
  const usernameRaw = document.getElementById("username")?.value.trim()    || "";
  const classVal    = document.getElementById("signupClass")?.value        || "10";
  const board       = document.getElementById("signupBoard")?.value        || "ICSE";
  const username    = usernameRaw.toLowerCase();

  if (!email || !password || !fullName) {
    showAuthMessage("Please fill in all required fields.");
    return;
  }

  // Username validation
  if (!username || username.length < 3) {
    showAuthMessage("Username must be at least 3 characters.");
    return;
  }
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
    showAuthMessage("Username can only contain letters, numbers, _ and .");
    return;
  }

  // Check username uniqueness BEFORE creating auth user
  const { data: existingUser } = await supabaseClient
    .from("user_profiles")
    .select("id")
    .eq("username", username)
    .limit(1);
  if (existingUser && existingUser.length > 0) {
    showAuthMessage("That username is already taken. Please choose another.");
    return;
  }

  // Check email uniqueness BEFORE creating auth user
  const { data: existingEmail } = await supabaseClient
    .from("user_profiles")
    .select("id")
    .eq("email", email)
    .limit(1);

  if (existingEmail && existingEmail.length > 0) {
    showAuthMessage("This email is already registered. Try logging in instead.");
    return;
  }

  const btn = document.getElementById("signupBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }

  // Create auth user — pass profile data as metadata so the DB trigger can use it
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name:   fullName,
        username,
        class_level: classVal,
        board,
      }
    }
  });
  if (error) {
    const msg = error.message || "";
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered") || msg.toLowerCase().includes("user already exists")) {
      showAuthMessage("This email is already registered. Try logging in instead.");
    } else {
      showAuthMessage("Signup failed: " + msg);
    }
    if (btn) { btn.disabled = false; btn.textContent = "Create account"; }
    return;
  }

  // Profile data to save
  const profileData = {
    full_name:          fullName,
    username,
    email,
    class_level:        classVal,
    board,
    streak:             0,
    best_streak:        0,
    last_active_date:   null,
    total_time_minutes: 0,
    questions_count:    0,
    bio:                "",
  };

  // Always save to localStorage as fallback
  localStorage.setItem("pendingProfile", JSON.stringify(profileData));

  // Attempt immediate insert using the returned user.id.
  // Works when email confirmation is disabled (session returned).
  // When email confirm is ON, the DB trigger handles it automatically.
  if (data?.user?.id) {
    try {
      const { error: insertErr } = await supabaseClient
        .from("user_profiles")
        .upsert({ id: data.user.id, ...profileData });
      if (!insertErr) localStorage.removeItem("pendingProfile");
    } catch (e) { /* DB trigger will handle it */ }
  }

  showAuthMessage("Account created! Check your email to confirm, then login.", "success");
  if (btn) { btn.disabled = false; btn.textContent = "Create account"; }
}

async function logout() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) { alert("Logout failed. Try again."); return; }
  localStorage.removeItem("supabase.auth.token");
  window.location.href = "login.html";
}

/* ─────────────────────────────────────────────
   EVERYTHING THAT NEEDS THE DOM
───────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {

  /* ── DOM refs ── */
  const classLevelSelect = document.getElementById("classLevel");
  const boardSelect      = document.getElementById("board");
  const subjectSelect    = document.getElementById("subject");
  const chapterInput     = document.getElementById("chapter");
  const questionInput    = document.getElementById("questionInput");
  const sendBtn          = document.getElementById("sendBtn");
  const chatWindow       = document.getElementById("chatWindow");
  const questionForm     = document.getElementById("questionForm");
  const uploadBtn        = document.getElementById("uploadBtn");
  const fileInput        = document.getElementById("fileInput");
  const chipsRow         = document.getElementById("uploadChipsRow");
  const voiceBtn         = document.getElementById("voiceBtn");
  const menuToggle       = document.getElementById("menuToggle");
  const menuDropdown     = document.getElementById("menuDropdown");
  const themeToggle      = document.getElementById("themeToggle");

  /* ════════════════════════════════
     SESSION GUARD + AUTH STATE LISTENER
  ════════════════════════════════ */
  if (supabaseClient) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const page = window.location.pathname.split("/").pop() || "index.html";

    if (["login.html", "signup.html"].includes(page) && session) {
      window.location.replace("dashboard.html"); return;
    }
    if (page === "dashboard.html" && !session) {
      window.location.replace("login.html"); return;
    }

    // ── Hide page loader now that auth check is done ──
    if (typeof window.__hidePageLoader === "function") window.__hidePageLoader();

    // ── Pending profile: write it now that user has a live session ──
    if (session) {
      const pending = localStorage.getItem("pendingProfile");
      if (pending) {
        try {
          const profileData = JSON.parse(pending);
          await supabaseClient.from("user_profiles").upsert({
            id: session.user.id,
            ...profileData,
          });
          localStorage.removeItem("pendingProfile");
        } catch (e) { /* retry next time */ }
      }
    }

    // ── Auto-logout: handle account deletion and token revocation on ALL pages ──
    supabaseClient.auth.onAuthStateChange((event, changedSession) => {
      const publicPages = ["login.html", "signup.html", "index.html", "founder.html", "help.html"];
      const currentPage = window.location.pathname.split("/").pop() || "index.html";

      if (event === "USER_DELETED") {
        // Account was deleted — sign out locally and redirect
        supabaseClient.auth.signOut().catch(() => {});
        localStorage.removeItem("supabase.auth.token");
        window.location.replace("login.html");
        return;
      }

      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !changedSession)) {
        // Signed out or token invalid — redirect from protected pages
        if (!publicPages.includes(currentPage)) {
          window.location.replace("login.html");
        }
        return;
      }

      // When session refreshes successfully, update nav links
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        updateNavAuthLinks();
      }
    });

    // ── Session validity poll: catches deletion from auth OR user_profiles ──
    const _publicPages = ['login.html', 'signup.html', 'index.html', 'founder.html', 'help.html'];
    async function _forceLogout() {
      await supabaseClient.auth.signOut().catch(() => {});
      localStorage.removeItem('supabase.auth.token');
      const _page = window.location.pathname.split('/').pop() || 'index.html';
      if (!_publicPages.includes(_page)) {
        window.location.replace('login.html');
      }
    }
    setInterval(async () => {
      try {
        // 1. Check auth user still exists
        const { data, error } = await supabaseClient.auth.getUser();
        if (error || !data?.user) { await _forceLogout(); return; }

        // 2. Check profile row still exists in DB (catches delete from user_profiles)
        const { data: profile, error: profileErr } = await supabaseClient
          .from('user_profiles')
          .select('id')
          .eq('id', data.user.id)
          .single();
        if (profileErr || !profile) { await _forceLogout(); return; }
      } catch (e) { /* network error — skip */ }
    }, 15 * 1000); // check every 15 seconds
  }

  /* ════════════════════════════════
     THEME + NAVBAR
  ════════════════════════════════ */
  document.body.setAttribute("data-theme", localStorage.getItem("theme") || "dark");

  menuToggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    menuDropdown?.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (menuDropdown && !menuDropdown.contains(e.target) && !menuToggle?.contains(e.target)) {
      menuDropdown.classList.remove("open");
    }
  });

  themeToggle?.addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    localStorage.setItem("theme", next);
  });

  /* ════════════════════════════════
     MODEL SELECTOR — Gemini-style flat, fixed-position dropdown
  ════════════════════════════════ */
  const mBtn  = document.getElementById("modelBtn");
  const mDrop = document.getElementById("modelDropdown");

  if (mBtn && mDrop) {
    const pillLabel = document.getElementById("modelPillLabel");
    const chipIcon  = mBtn.querySelector(".model-chip-icon");
    const checkT1   = document.getElementById("checkT1");
    const checkT2   = document.getElementById("checkT2");

    const modelMeta = {
      t1: { label: "T1 · Flash", icon: "⚡" },
      t2: { label: "T2 · Pro",   icon: "🧠" },
    };

    function setActiveModel(model) {
      selectedModel = model;
      if (pillLabel) pillLabel.textContent = modelMeta[model].label;
      if (chipIcon)  chipIcon.textContent  = modelMeta[model].icon;
      if (checkT1)   checkT1.textContent   = model === "t1" ? "✓" : "";
      if (checkT2)   checkT2.textContent   = model === "t2" ? "✓" : "";
      mDrop.querySelectorAll(".mdp-option").forEach(el => {
        el.classList.toggle("active", el.dataset.model === model);
      });
    }

    function positionAndOpen() {
      const r = mBtn.getBoundingClientRect();
      const dropW = mDrop.offsetWidth || 230;
      // Place above the button
      let left = r.right - dropW;
      if (left < 8) left = 8;
      mDrop.style.left   = left + "px";
      mDrop.style.top    = "auto";
      mDrop.style.bottom = (window.innerHeight - r.top + 8) + "px";
      mDrop.classList.add("open");
      mBtn.classList.add("open");
    }

    function closeDropdown() {
      mDrop.classList.remove("open");
      mBtn.classList.remove("open");
    }

    mBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      mDrop.classList.contains("open") ? closeDropdown() : positionAndOpen();
    });

    mDrop.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-model]");
      if (!opt) return;
      setActiveModel(opt.dataset.model);
      closeDropdown();
    });

    document.addEventListener("click", (e) => {
      if (!mBtn.contains(e.target) && !mDrop.contains(e.target)) closeDropdown();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDropdown();
    });

    setActiveModel("t1");
  }


  /* ════════════════════════════════
     AUTO-SCROLL DETECTION
  ════════════════════════════════ */
  /* ── Always auto-scroll to bottom during streaming ── */

  /* ════════════════════════════════
     AUTO-GROW TEXTAREA
  ════════════════════════════════ */
  function growTextarea() {
    if (!questionInput) return;
    questionInput.style.height = "auto";
    questionInput.style.height = Math.min(questionInput.scrollHeight, 160) + "px";
  }

  questionInput?.addEventListener("input", growTextarea);

  /* ════════════════════════════════
     UPLOAD DROPDOWN — show menu with options
  ════════════════════════════════ */
  const uploadDropdown = document.getElementById("uploadDropdown");
  const photoInput = document.getElementById("photoInput");
  const cameraInput = document.getElementById("cameraInput");

  // Show upload dropdown when upload button clicked
  uploadBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!uploadDropdown) return;
    
    const isOpen = uploadDropdown.classList.contains("open");
    uploadDropdown.classList.toggle("open", !isOpen);
    
    if (!isOpen) {
      const rect = uploadBtn.getBoundingClientRect();
      uploadDropdown.style.left = rect.left + "px";
      uploadDropdown.style.bottom = (window.innerHeight - rect.top + 8) + "px";
    }
  });

  // Close upload dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (uploadDropdown && !uploadDropdown.contains(e.target) && e.target !== uploadBtn) {
      uploadDropdown.classList.remove("open");
    }
  });

  // Handle upload option clicks
  document.querySelectorAll(".upload-option").forEach(option => {
    option.addEventListener("click", () => {
      const type = option.dataset.uploadType;
      uploadDropdown?.classList.remove("open");
      
      if (type === "file") {
        fileInput?.click();
      } else if (type === "photo") {
        photoInput?.click();
      } else if (type === "camera") {
        cameraInput?.click();
      }
    });
  });

  /* ════════════════════════════════
     FILE UPLOAD — chip UI (handles all inputs)
  ════════════════════════════════ */
  async function handleFileSelection(files) {
    for (const file of files) {
      if (attachedFiles.find(f => f.file.name === file.name)) continue;

      const mimeType = file.type || "application/octet-stream";
      const isImage  = mimeType.startsWith("image/");
      const isPDF    = mimeType === "application/pdf";
      const isText   = mimeType.startsWith("text/");
      const fileType = isImage ? "image" : isPDF ? "pdf" : isText ? "text" : "other";

      const entry = { file, dataURL: null, base64: null, mimeType, type: fileType };
      attachedFiles.push(entry);

      try {
        entry.base64 = await fileToBase64(file);
        if (isImage) entry.dataURL = "data:" + mimeType + ";base64," + entry.base64;
      } catch (err) {
        console.error("File read error:", err);
      }

      addChip(entry);
    }
  }

  fileInput?.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    await handleFileSelection(files);
    fileInput.value = "";
  });

  photoInput?.addEventListener("change", async () => {
    const files = Array.from(photoInput.files || []);
    await handleFileSelection(files);
    photoInput.value = "";
  });

  cameraInput?.addEventListener("change", async () => {
    const files = Array.from(cameraInput.files || []);
    await handleFileSelection(files);
    cameraInput.value = "";
  });

  function addChip(entry) {
    if (!chipsRow) return;
    chipsRow.classList.add("has-files");

    const chip = document.createElement("div");
    chip.className  = "upload-chip";
    chip.dataset.name = entry.file.name;

    if (entry.type === "image" && entry.dataURL) {
      const img = document.createElement("img");
      img.src = entry.dataURL;
      img.className = "chip-thumb";
      img.style.cursor = "zoom-in";
      img.addEventListener("click", (e) => { e.stopPropagation(); openLightbox(entry.dataURL, entry.file.name); });
      chip.appendChild(img);
    } else {
      const icon = document.createElement("div");
      icon.className   = "chip-file-icon";
      icon.textContent = entry.type === "pdf" ? "📄" : entry.type === "text" ? "📝" : "📎";
      chip.appendChild(icon);
    }

    const meta = document.createElement("div");
    meta.className = "chip-meta";
    const nameEl = document.createElement("span");
    nameEl.className   = "chip-name";
    nameEl.textContent = entry.file.name;
    const sizeEl = document.createElement("span");
    sizeEl.className   = "chip-size";
    sizeEl.textContent = fmtBytes(entry.file.size);
    meta.appendChild(nameEl);
    meta.appendChild(sizeEl);
    chip.appendChild(meta);

    const rm = document.createElement("button");
    rm.type      = "button";
    rm.className = "chip-remove";
    rm.innerHTML = "✕";
    rm.addEventListener("click", () => {
      attachedFiles = attachedFiles.filter(f => f.file.name !== entry.file.name);
      chip.remove();
      if (attachedFiles.length === 0) chipsRow.classList.remove("has-files");
    });
    chip.appendChild(rm);
    chipsRow.appendChild(chip);
  }

  /* ════════════════════════════════
     PASTE IMAGE (Ctrl+V / Cmd+V)
  ════════════════════════════════ */
  document.addEventListener("paste", (e) => {
    if (!chipsRow) return;
    const items      = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(i => i.type.startsWith("image/"));
    if (!imageItems.length) return;

    e.preventDefault();

    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;

      const ext      = file.type.split("/")[1] || "png";
      const name     = "pasted-image-" + Date.now() + "." + ext;
      const named    = new File([file], name, { type: file.type });
      const mimeType = named.type;
      const entry    = { file: named, dataURL: null, base64: null, mimeType, type: "image" };
      attachedFiles.push(entry);

      const reader = new FileReader();
      reader.onload = (ev) => {
        entry.base64  = ev.target.result.split(",")[1];
        entry.dataURL = ev.target.result;
        addChip(entry);

        const bar = document.querySelector(".free-input-bar");
        if (bar) {
          bar.style.transition = "box-shadow 0.2s";
          bar.style.boxShadow  = "0 0 0 2px rgba(16,185,129,0.5)";
          setTimeout(() => { bar.style.boxShadow = ""; }, 500);
        }
      };
      reader.readAsDataURL(named);
    });
  });

  /* ════════════════════════════════
     IMAGE GENERATION DETECTION
  ════════════════════════════════ */
  // Detect image generation requests
  function isImageRequest(text) {
    const t = text.trim();
    const startsWithVisual = /^(draw|sketch|illustrate|visualize|visualise|diagram of|diagram for)/i.test(t);
    const containsImageWord = /(image|diagram|picture|illustration|drawing|sketch)/i.test(t);
    const containsVisualVerb = /^(draw|sketch|illustrate|generate|create|make|paint|visualize|visualise|design|show)/i.test(t);
    return startsWithVisual || (containsVisualVerb && containsImageWord);
  }

  /* ════════════════════════════════
     LIGHTBOX — full screen image viewer
  ════════════════════════════════ */
  function openLightbox(src, caption) {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "cursor:zoom-out;animation:lbFadeIn 0.18s ease;";

    // Top toolbar
    const topBar = document.createElement("div");
    topBar.style.cssText =
      "position:absolute;top:0;left:0;right:0;padding:12px 16px;" +
      "display:flex;align-items:center;justify-content:space-between;" +
      "background:linear-gradient(rgba(0,0,0,0.6),transparent);pointer-events:none;";

    const capEl = document.createElement("span");
    capEl.style.cssText = "color:rgba(255,255,255,0.7);font-size:0.82rem;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    capEl.textContent = caption || "";

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;pointer-events:auto;";

    function lbBtn(icon, title) {
      const b = document.createElement("button");
      b.type = "button"; b.title = title; b.innerHTML = icon;
      b.style.cssText =
        "background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);border:none;" +
        "color:#fff;border-radius:8px;width:36px;height:36px;cursor:pointer;" +
        "font-size:16px;display:flex;align-items:center;justify-content:center;";
      b.addEventListener("mouseenter", () => b.style.background = "rgba(255,255,255,0.22)");
      b.addEventListener("mouseleave", () => b.style.background = "rgba(255,255,255,0.12)");
      return b;
    }

    const dlLbBtn = lbBtn("⬇", "Download");
    dlLbBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = src; a.download = "teengro-diagram.png"; a.click();
    });

    const closeLbBtn = lbBtn("✕", "Close");
    closeLbBtn.addEventListener("click", (e) => { e.stopPropagation(); overlay.remove(); });

    btnRow.appendChild(dlLbBtn);
    btnRow.appendChild(closeLbBtn);
    topBar.appendChild(capEl);
    topBar.appendChild(btnRow);

    // Image
    const img = document.createElement("img");
    img.src = src;
    img.style.cssText =
      "max-width:92vw;max-height:88vh;object-fit:contain;border-radius:10px;" +
      "box-shadow:0 8px 60px rgba(0,0,0,0.8);";
    img.addEventListener("click", (e) => e.stopPropagation());

    overlay.appendChild(topBar);
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    // Close on backdrop click or Escape
    overlay.addEventListener("click", () => overlay.remove());
    const onKey = (e) => { if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);
  }

  async function generateImage(prompt) {
    // ── User bubble ──
    const userRow    = document.createElement("div");
    userRow.className = "message-row user";
    const userBubble = document.createElement("div");
    userBubble.className = "message-bubble";
    const txt = document.createElement("div");
    txt.innerText = prompt;
    userBubble.appendChild(txt);
    userRow.appendChild(userBubble);
    chatWindow.appendChild(userRow);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    // ── Clear input ──
    questionInput.value = "";
    questionInput.style.height = "auto";
    questionInput.disabled = true;
    sendBtn.disabled = true;

    // ── Bot loader bubble ──
    const botRow  = document.createElement("div");
    botRow.className = "message-row bot";
    const bubble  = document.createElement("div");
    bubble.className = "message-bubble";
    const content = document.createElement("div");

    // ── Image generation loader — canvas that fills in like pixels appearing ──
    const imgLoaderWrap = document.createElement("div");
    imgLoaderWrap.style.cssText =
      "display:flex;flex-direction:column;gap:10px;padding:4px 0;";

    // Canvas that progressively "paints" coloured blocks
    const canvas = document.createElement("canvas");
    const CW = 340, CH = 220, BLOCK = 10;
    canvas.width  = CW;
    canvas.height = CH;
    canvas.style.cssText =
      "width:100%;max-width:" + CW + "px;height:" + CH + "px;" +
      "border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:block;";

    const ctx = canvas.getContext("2d");
    const cols = Math.ceil(CW / BLOCK);
    const rows = Math.ceil(CH / BLOCK);
    const totalBlocks = cols * rows;

    // Fill with dark base
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, CW, CH);

    // Shuffle block indices so they fill in random order
    const indices = Array.from({ length: totalBlocks }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Palette — muted blues/teals/purples like an AI rendering
    const palette = [
      "#1a1f2e","#1e2535","#22304a","#1a3a4a","#1e3550",
      "#243040","#182838","#1c2d3c","#202840","#1a2a3a",
      "#0f4c5c","#0d3348","#163447","#0e3d50","#103045",
    ];

    let painted = 0;
    const batchSize = Math.ceil(totalBlocks / 60); // fill over ~60 frames

    function paintFrame() {
      const end = Math.min(painted + batchSize, totalBlocks);
      for (let i = painted; i < end; i++) {
        const idx = indices[i];
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = col * BLOCK, y = row * BLOCK;

        // Each block: random palette colour with slight brightness variation
        const base = palette[Math.floor(Math.random() * palette.length)];
        ctx.fillStyle = base;
        ctx.fillRect(x, y, BLOCK - 1, BLOCK - 1);

        // Occasional lighter "highlight" block
        if (Math.random() < 0.07) {
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.fillRect(x, y, BLOCK - 1, BLOCK - 1);
        }
      }
      painted = end;
    }

    const paintTimer = setInterval(() => {
      if (painted < totalBlocks) {
        paintFrame();
      } else {
        // All filled — add a subtle scan-line sweep to show "processing"
        ctx.fillStyle = "rgba(255,255,255,0.015)";
        const scanY = (Date.now() / 8) % CH;
        ctx.fillRect(0, scanY, CW, 3);
      }
    }, 16); // ~60fps

    // Status text below canvas
    const statusEl = document.createElement("div");
    statusEl.style.cssText =
      "font-size:0.8rem;opacity:0.6;display:flex;align-items:center;gap:8px;";

    const dot = document.createElement("span");
    dot.style.cssText =
      "width:7px;height:7px;border-radius:50%;background:#10b981;flex-shrink:0;" +
      "animation:imgDotPulse 0.9s infinite alternate;display:inline-block;";

    const statusText = document.createElement("span");
    const steps = [
      "Understanding your prompt…",
      "Composing the layout…",
      "Drawing shapes and lines…",
      "Adding labels…",
      "Refining details…",
      "Almost ready…",
    ];
    let stepIdx = 0;
    statusText.textContent = steps[0];

    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      statusText.textContent = steps[stepIdx];
    }, 2200);

    statusEl.appendChild(dot);
    statusEl.appendChild(statusText);

    imgLoaderWrap.appendChild(canvas);
    imgLoaderWrap.appendChild(statusEl);
    content.appendChild(imgLoaderWrap);
    bubble.appendChild(content);
    botRow.appendChild(bubble);
    chatWindow.appendChild(botRow);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
      const res = await fetch(`${backendBaseUrl}/api/generate-image`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          prompt,
          board:       boardSelect?.value      || "ICSE",
          class_level: classLevelSelect?.value || "10",
          subject:     subjectSelect?.value    || "General",
        }),
      });

      const data = await res.json();
      clearInterval(stepTimer);
      clearInterval(paintTimer);
      imgLoaderWrap.remove();

      if (!res.ok || data.error) {
        content.innerText = "Could not generate image: " + (data.detail || data.error || `HTTP ${res.status}`);
        console.error("Image gen error:", data);
      } else {
        const imgSrc = `data:${data.mimeType};base64,${data.image}`;

        // ── Gemini-style image card: image + hover toolbar on top ──
        const card = document.createElement("div");
        card.style.cssText =
          "position:relative;display:inline-block;max-width:100%;border-radius:14px;" +
          "overflow:hidden;cursor:zoom-in;";

        const imgEl = document.createElement("img");
        imgEl.src   = imgSrc;
        imgEl.alt   = prompt;
        imgEl.style.cssText =
          "display:block;max-width:100%;max-height:480px;object-fit:contain;" +
          "border-radius:14px;border:1px solid rgba(255,255,255,0.08);";

        // Toolbar that slides in on hover (top-right, like Gemini)
        const toolbar = document.createElement("div");
        toolbar.style.cssText =
          "position:absolute;top:8px;right:8px;display:flex;gap:6px;" +
          "opacity:0;transition:opacity 0.2s;pointer-events:none;";

        function toolBtn(icon, title) {
          const b = document.createElement("button");
          b.type = "button";
          b.title = title;
          b.innerHTML = icon;
          b.style.cssText =
            "background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);border:none;" +
            "color:#fff;border-radius:8px;width:34px;height:34px;cursor:pointer;" +
            "font-size:15px;display:flex;align-items:center;justify-content:center;" +
            "transition:background 0.15s;";
          b.addEventListener("mouseenter", () => b.style.background = "rgba(0,0,0,0.85)");
          b.addEventListener("mouseleave", () => b.style.background = "rgba(0,0,0,0.65)");
          return b;
        }

        // Download button
        const dlBtn = toolBtn("⬇", "Download image");
        dlBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const a = document.createElement("a");
          a.href     = imgSrc;
          a.download = "teengro-diagram.png";
          a.click();
        });

        // Open full size button
        const expandBtn = toolBtn("⤢", "View full size");
        expandBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openLightbox(imgSrc, prompt);
        });

        toolbar.appendChild(expandBtn);
        toolbar.appendChild(dlBtn);

        // Show/hide toolbar on hover
        card.addEventListener("mouseenter", () => {
          toolbar.style.opacity = "1";
          toolbar.style.pointerEvents = "auto";
        });
        card.addEventListener("mouseleave", () => {
          toolbar.style.opacity = "0";
          toolbar.style.pointerEvents = "none";
        });

        // Click image to open lightbox
        imgEl.addEventListener("click", () => openLightbox(imgSrc, prompt));

        card.appendChild(imgEl);
        card.appendChild(toolbar);
        content.appendChild(card);

        // Caption
        const caption = document.createElement("div");
        caption.style.cssText = "font-size:0.75rem;opacity:0.45;margin-top:6px;";
        caption.textContent = prompt;
        content.appendChild(caption);
      }
    } catch (err) {
      clearInterval(stepTimer);
      clearInterval(paintTimer);
      imgLoaderWrap.remove();
      content.innerText = "Network error generating image.";
      console.error(err);
    }

    questionInput.disabled = false;
    sendBtn.disabled       = false;
    questionInput.focus();
  }

  /* ════════════════════════════════
     SEND / STOP STATE
  ════════════════════════════════ */
  let isStreaming  = false;
  let abortStream  = null; // function to call to cancel current stream
  const sendIcon   = document.getElementById("sendIcon");
  const stopIcon   = document.getElementById("stopIcon");

  function setStreamingUI(streaming) {
    isStreaming = streaming;
    if (sendIcon) sendIcon.style.display = streaming ? "none"  : "";
    if (stopIcon) stopIcon.style.display = streaming ? ""      : "none";
    if (sendBtn)  sendBtn.title          = streaming ? "Stop"  : "Send";
    if (sendBtn)  sendBtn.type           = streaming ? "button": "submit";
  }

  /* ════════════════════════════════
     SEND QUESTION
  ════════════════════════════════ */
  async function sendQuestion(e, forceQuestion = null) {
    e?.preventDefault();

    // If currently streaming, stop it
    if (isStreaming) {
      abortStream?.();
      return;
    }

    if (!questionInput || !sendBtn || !chatWindow) return;

    const question = forceQuestion ?? questionInput.value.trim();
    const hasFiles  = attachedFiles.length > 0;
    if (!question && !hasFiles) return;

    // ── Track question + update streak (fires on every real send) ──
    trackQuestionAndStreak();

    // ── Route to image generation if no files and prompt matches ──
    if (!hasFiles && isImageRequest(question)) {
      generateImage(question);
      return;
    }

    const filesToSend = [...attachedFiles];
    const images      = filesToSend.filter(f => f.type === "image");
    const nonImages   = filesToSend.filter(f => f.type !== "image");

    /* ── User bubble ── */
    const userRow    = document.createElement("div");
    userRow.className = "message-row user";
    const userBubble = document.createElement("div");
    userBubble.className = "message-bubble";

    if (images.length) {
      const grid = document.createElement("div");
      grid.className = "chat-img-grid";
      images.forEach(f => {
        const img = document.createElement("img");
        img.src = f.dataURL;
        img.alt = f.file.name;
        img.style.cursor = "zoom-in";
        img.title = "Click to view full size";
        img.addEventListener("click", () => openLightbox(f.dataURL, f.file.name));
        grid.appendChild(img);
      });
      userBubble.appendChild(grid);
    }

    if (nonImages.length) {
      const fl = document.createElement("div");
      fl.style.cssText = "font-size:0.78rem;opacity:0.65;margin-bottom:4px;";
      fl.textContent   = nonImages.map(f =>
        (f.type === "pdf" ? "📄 " : "📎 ") + f.file.name
      ).join("   ");
      userBubble.appendChild(fl);
    }

    if (question) {
      const txt = document.createElement("div");
      txt.innerText = question;
      userBubble.appendChild(txt);
    }

    userRow.appendChild(userBubble);
    chatWindow.appendChild(userRow);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    /* ── File payload ── */
    const filePayload = filesToSend
      .filter(f => f.base64)
      .map(f => ({ name: f.file.name, mimeType: f.mimeType, base64: f.base64 }));

    /* ── Clear state (skip when regenerating) ── */
    if (!forceQuestion) {
      questionInput.value = "";
      questionInput.style.height = "auto";
      attachedFiles = [];
      if (chipsRow) { chipsRow.innerHTML = ""; chipsRow.classList.remove("has-files"); }
    }

    questionInput.disabled = true;
    setStreamingUI(true);

    /* ── Bot loader: bare atom (no box); bubble added when text arrives ── */
    const botRow = document.createElement("div");
    botRow.className = "message-row bot";

    /* Loader — naked, no bubble class */
    const loader = document.createElement("div");
    loader.className = "gemini-loader";
    loader.innerHTML = `<svg width="72" height="72" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(150,150)">
        <g transform="rotate(-25)">
          <ellipse class="gl-orbit gl-orbit-1" cx="0" cy="0" rx="110" ry="36" pathLength="100"/>
          <circle  class="gl-electron"          cx="78"  cy="-26" r="9"/>
        </g>
        <g transform="rotate(35)">
          <ellipse class="gl-orbit gl-orbit-2" cx="0" cy="0" rx="110" ry="36" pathLength="100"/>
          <circle  class="gl-electron gl-electron-2" cx="-110" cy="0"  r="9"/>
        </g>
        <g transform="rotate(85)">
          <ellipse class="gl-orbit gl-orbit-3" cx="0" cy="0" rx="110" ry="36" pathLength="100"/>
          <circle  class="gl-electron gl-electron-3" cx="0"   cy="36" r="9"/>
        </g>
      </g>
    </svg><div class="gl-label">Generating answer…</div>`;
    botRow.appendChild(loader);

    /* content bubble — NOT in DOM yet; appended the moment first text chunk arrives */
    const content = document.createElement("div");
    content.className = "message-bubble";

    chatWindow.appendChild(botRow);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    /* ── Shared mutable stop flag (object so closure always sees latest) ── */
    const ctrl = { cancelled: false };

    /* ── Word-by-word fade queue ── */
    let wordQueue = [];
    let wordTimer = null;

    function flushWords() {
      if (ctrl.cancelled || !wordQueue.length) {
        wordTimer = null;
        /* Queue empty and stream done → now safe to reset UI */
        if (!ctrl.cancelled && streamDone) {
          abortStream = null;
          questionInput.disabled = false;
          setStreamingUI(false);
          questionInput.focus();
          addMessageActions(botRow, content, question, () => sendQuestion(null, question));
        }
        return;
      }
      const token = wordQueue.shift();
      const span  = document.createElement("span");
      span.className = "stream-word";
      span.innerHTML = token;
      content.appendChild(span);
      chatWindow.scrollTop = chatWindow.scrollHeight;
      wordTimer = setTimeout(flushWords, 25);
    }

    function enqueueText(htmlText) {
      if (ctrl.cancelled) return;
      const parts = htmlText.split(/(?=\s)|(?<=\s)/);
      for (const p of parts) { if (p) wordQueue.push(p); }
      if (!wordTimer) flushWords();
    }

    /* ── AbortController for fetch ── */
    const ac = new AbortController();
    let streamDone = false;

    /* ── Wire stop button ── */
    abortStream = () => {
      ctrl.cancelled = true;
      wordQueue = [];
      if (wordTimer) { clearTimeout(wordTimer); wordTimer = null; }
      ac.abort();
      if (loader.parentNode) loader.remove();
      questionInput.disabled = false;
      setStreamingUI(false);
      questionInput.focus();
      // FIX: show action buttons even on early stop, but only if some content was streamed
      if (content.parentNode && (content.innerText || content.textContent).trim().length > 0) {
        addMessageActions(botRow, content, question, () => sendQuestion(null, question));
      }
    };

    let firstChunk = false;

    try {
      const response = await fetch(`${backendBaseUrl}/api/ask`, {
        method:  "POST",
        signal:  ac.signal,
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        body:    JSON.stringify({
          board:       boardSelect?.value      || "ICSE",
          class_level: classLevelSelect?.value || "10",
          subject:     subjectSelect?.value    || "General",
          chapter:     chapterInput?.value     || "General",
          question,
          model:       selectedModel,
          files:       filePayload,
        }),
      });

      if (!response.ok || !response.body) throw new Error("Server error");

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (!ctrl.cancelled) {
        const { done, value } = await reader.read();
        if (done || ctrl.cancelled) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();

        for (const part of parts) {
          if (ctrl.cancelled) break;
          if (part.startsWith("data:")) {
            const jsonStr = part.replace("data:", "").trim();
            if (!jsonStr) continue;
            let text;
            try { text = JSON.parse(jsonStr); } catch { continue; }
            if (!text) continue;
            if (!firstChunk) { loader.remove(); botRow.appendChild(content); firstChunk = true; }
            enqueueText(formatGeminiResponse(text));
          }
          if (part.includes("event: error")) { if (loader.parentNode) loader.remove(); if (!content.parentNode) botRow.appendChild(content); content.innerText = "Server error."; }
          if (part.includes("event: end"))   { if (loader.parentNode) loader.remove(); reader.cancel(); break; }
        }
      }
    } catch (err) {
      // AbortError is expected when user clicks stop — ignore it silently
      if (err.name !== "AbortError" && !ctrl.cancelled) {
        console.error(err);
        if (loader.parentNode) loader.remove();
        if (!content.parentNode) botRow.appendChild(content);
        content.innerText = "Network error. Backend unreachable.";
      }
    }

    /* Stream finished — mark done. If word queue already drained, reset UI now.
       Otherwise flushWords will reset UI once the queue empties. */
    if (!ctrl.cancelled) {
      streamDone = true;
      if (!wordTimer && !wordQueue.length) {
        abortStream = null;
        questionInput.disabled = false;
        setStreamingUI(false);
        questionInput.focus();
        addMessageActions(botRow, content, question, () => sendQuestion(null, question));
      }
    }
  }

  /* ── Send / Stop bindings ── */
  sendBtn?.addEventListener("click", (e) => { e.preventDefault(); sendQuestion(e); });
  questionForm?.addEventListener("submit", (e) => sendQuestion(e));
  questionInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(e); }
  });

  /* ════════════════════════════════
     VOICE INPUT
  ════════════════════════════════ */
  if (voiceBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      voiceBtn.style.opacity = "0.35";
      voiceBtn.style.cursor  = "not-allowed";
      voiceBtn.title = "Voice input not supported in this browser";
    } else {
      const recog = new SpeechRecognition();
      recog.lang            = "en-IN";
      recog.continuous      = true;
      recog.interimResults  = true;
      recog.maxAlternatives = 3;

      let listening     = false;
      let committed     = "";

      function updateTextarea(display) {
        if (!questionInput) return;
        questionInput.value = display;
        growTextarea();
      }

      voiceBtn.addEventListener("click", () => {
        if (listening) {
          recog.stop();
        } else {
          committed = questionInput?.value || "";
          recog.start();
        }
      });

      recog.onstart = () => {
        listening = true;
        voiceBtn.classList.add("recording");
        voiceBtn.title = "Tap to stop";
        if (questionInput) questionInput.placeholder = "Listening…";
      };

      recog.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            committed = (committed + " " + t).trimStart();
          } else {
            interim = t;
          }
        }
        updateTextarea(interim ? committed + " " + interim : committed);
      };

      recog.onend = () => {
        listening = false;
        voiceBtn.classList.remove("recording");
        voiceBtn.title = "Voice input";
        if (questionInput) questionInput.placeholder = "Ask anything…";
        updateTextarea(committed);
        if (committed) questionInput?.focus();
      };

      recog.onerror = (event) => {
        if (event.error === "no-speech") return;
        listening = false;
        voiceBtn.classList.remove("recording");
        const msgs = {
          "audio-capture": "No microphone found.",
          "not-allowed":   "Microphone access denied.",
          "network":       "Network error.",
        };
        if (questionInput) {
          questionInput.placeholder = msgs[event.error] || "Voice error.";
          setTimeout(() => { questionInput.placeholder = "Ask anything…"; }, 3000);
        }
      };
    }
  }

}); // end DOMContentLoaded
/* ═══════════════════════════════════════════════════════════════
   PROFILE  ·  STREAK  ·  TIME TRACKING  ·  PANEL (ALL PAGES)
═══════════════════════════════════════════════════════════════ */

/* ── Small utilities ── */
function todayStr() { return new Date().toISOString().split("T")[0]; }

function fmtTime(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  if (totalMinutes < 1) return Math.round(totalMinutes * 60) + "s"; // show seconds for < 1 min
  if (totalMinutes < 60) return Math.round(totalMinutes) + "m";
  const h = Math.floor(totalMinutes / 60), m = Math.round(totalMinutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getInitials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

/* ── Streak ── */
function computeStreak(lastDate, currentStreak) {
  const today = todayStr();
  if (lastDate === today) return { streak: currentStreak, lastDate: today };
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split("T")[0];
  if (lastDate === yStr) return { streak: (currentStreak || 0) + 1, lastDate: today };
  return { streak: 1, lastDate: today };
}

/* ── Session time tracker (dashboard only) ──
   One session = time from page load until tab close.
   Timer runs continuously — no resets on tab hide/show.
   Every 60s we save the delta (elapsed − already saved) to Supabase.
───────────────────────────────────────────── */
const _sessionStart    = Date.now();   // never changes
let   _savedMinutes    = 0;            // how many minutes already written to DB this session

function _elapsedMins() {
  return (Date.now() - _sessionStart) / 60000;
}

async function _saveTimeDelta() {
  const page = window.location.pathname.split("/").pop();
  if (page !== "dashboard.html" || !supabaseClient) return;

  const elapsed = _elapsedMins();
  const delta   = elapsed - _savedMinutes;        // only save what's new
  if (delta < 0.017) return;                      // < ~1 second, skip

  _savedMinutes = elapsed;                         // mark as saved optimistically

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { _savedMinutes -= delta; return; } // roll back on no session

    const { data: row } = await supabaseClient
      .from("user_profiles")
      .select("total_time_minutes")
      .eq("id", session.user.id)
      .single();

    if (row) {
      const newTotal = (row.total_time_minutes || 0) + delta;
      await supabaseClient
        .from("user_profiles")
        .update({ total_time_minutes: newTotal })
        .eq("id", session.user.id);

      // Update the live display in the profile panel
      const el = document.getElementById("timeSpent");
      if (el) {
        el.dataset.baseMinutes = newTotal;  // keep base in sync with DB
        el.textContent = fmtTime(newTotal + _elapsedMins());
      }
    }
  } catch (e) {
    _savedMinutes -= delta; // roll back so it retries next tick
  }
}

// Save on tab close — write unsaved delta to localStorage as fallback
window.addEventListener("beforeunload", () => {
  const delta = _elapsedMins() - _savedMinutes;
  if (delta >= 0.017) {
    const pending = parseFloat(localStorage.getItem("tg_pending_time") || "0");
    localStorage.setItem("tg_pending_time", String(pending + delta));
  }
});

// On next page load, flush any localStorage time from last close
(async function _flushStoredTime() {
  const stored = parseFloat(localStorage.getItem("tg_pending_time") || "0");
  if (stored < 0.017 || !supabaseClient) return;
  localStorage.removeItem("tg_pending_time");
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const { data: row } = await supabaseClient
      .from("user_profiles")
      .select("total_time_minutes")
      .eq("id", session.user.id)
      .single();
    if (row) {
      const newTotal = (row.total_time_minutes || 0) + stored;
      await supabaseClient
        .from("user_profiles")
        .update({ total_time_minutes: newTotal })
        .eq("id", session.user.id);
      const el = document.getElementById("timeSpent");
      if (el) el.textContent = fmtTime(newTotal);
    }
  } catch (e) {
    // restore to localStorage if save failed
    localStorage.setItem("tg_pending_time", String(stored));
  }
})();

// Auto-save every 60 seconds — one continuous session, no resets
setInterval(_saveTimeDelta, 60 * 1000);

// Live display ticker — updates the timeSpent label every second
setInterval(() => {
  const el = document.getElementById("timeSpent");
  if (!el) return;
  // Read the base DB value from data attribute (set when profile loads)
  const base = parseFloat(el.dataset.baseMinutes || "0");
  el.textContent = fmtTime(base + _elapsedMins());
}, 1000);

/* ── Build profile panel HTML (injected into every page) ── */
function injectProfilePanel() {
  if (document.getElementById("profilePanel")) return; // already injected

  const panelHTML = `
  <div class="profile-overlay" id="profileOverlay"></div>
  <aside class="profile-panel" id="profilePanel">

    <div class="pp-header">
      <h2>My Profile</h2>
      <button class="pp-close" id="profileClose" title="Close">✕</button>
    </div>

    <!-- Logged-out state -->
    <div class="pp-loggedout" id="ppLoggedOut" style="display:none;">
      <div class="pp-lo-icon">👤</div>
      <div class="pp-lo-title">You're not logged in</div>
      <div class="pp-lo-sub">Login to view your profile, streaks, and study stats.</div>
      <a href="login.html" class="pp-lo-btn">Login</a>
      <a href="signup.html" class="pp-lo-btn pp-lo-btn-ghost">Create account</a>
    </div>

    <!-- Logged-in state -->
    <div class="pp-loggedin" id="ppLoggedIn" style="display:none;">

      <!-- Identity -->
      <div class="pp-identity">
        <div class="pp-avatar-wrap" id="ppAvatarWrap">
          <div class="pp-avatar" id="ppAvatar">?</div>
          <label class="pp-avatar-edit" title="Change photo" for="ppPhotoInput">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </label>
          <button class="pp-avatar-remove" id="ppAvatarRemove" title="Remove photo" style="display:none;" onclick="removeAvatar()">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <input type="file" id="ppPhotoInput" accept="image/*" style="display:none;" />
        </div>
        <div class="pp-name"    id="ppName">Loading…</div>
        <div style="font-size:0.8rem;font-weight:600;opacity:0.45;" id="ppUsername"></div>
        <div class="pp-email"   id="ppEmail"></div>
        <div class="pp-badge"><span>📚</span><span id="ppBadgeText">Student</span></div>
      </div>

      <!-- Stats -->
      <div class="pp-stats">
        <div class="pp-stat-card streak-active">
          <div class="pp-stat-icon"><span class="streak-flame">🔥</span></div>
          <div class="pp-stat-value" id="streakCount">0</div>
          <div class="pp-stat-label">Day streak</div>
        </div>
        <div class="pp-stat-card">
          <div class="pp-stat-icon">⏱️</div>
          <div class="pp-stat-value" id="timeSpent">0m</div>
          <div class="pp-stat-label">Study time</div>
        </div>
        <div class="pp-stat-card">
          <div class="pp-stat-icon">💬</div>
          <div class="pp-stat-value" id="questionsCount">0</div>
          <div class="pp-stat-label">Questions</div>
        </div>
        <div class="pp-stat-card">
          <div class="pp-stat-icon">📅</div>
          <div class="pp-stat-value" id="ppJoinedStat">—</div>
          <div class="pp-stat-label">Member since</div>
        </div>
      </div>

      <!-- Bio -->
      <div class="pp-bio-section" id="ppBioSection">
        <div class="pp-bio-text" id="ppBioText"></div>
      </div>

      <!-- Info rows -->
      <div class="pp-info-section">
        <div class="pp-info-row">
          <div class="pp-info-left"><span class="pp-info-icon">🪪</span><span class="pp-info-label">Username</span></div>
          <span class="pp-info-value" id="ppUsernameRow">—</span>
        </div>
        <div class="pp-info-row">
          <div class="pp-info-left"><span class="pp-info-icon">🏫</span><span class="pp-info-label">Class</span></div>
          <span class="pp-info-value" id="ppClass">—</span>
        </div>
        <div class="pp-info-row">
          <div class="pp-info-left"><span class="pp-info-icon">📋</span><span class="pp-info-label">Board</span></div>
          <span class="pp-info-value" id="ppBoard">—</span>
        </div>
        <div class="pp-info-row">
          <div class="pp-info-left"><span class="pp-info-icon">📖</span><span class="pp-info-label">Last subject</span></div>
          <span class="pp-info-value" id="ppLastSubject">—</span>
        </div>
      </div>

      <div class="pp-divider"></div>

      <!-- Edit form -->
      <div class="pp-edit-section">
        <div class="pp-edit-title">Edit Profile</div>
        <div class="pp-edit-form">
          <div class="pp-edit-field">
            <label>Name</label>
            <input type="text" id="editName" placeholder="Your full name" />
          </div>
          <div class="pp-edit-field">
            <label>Username</label>
            <input type="text" id="editUsername" placeholder="e.g. arjun_s"
              pattern="[a-zA-Z0-9_.]+" title="Letters, numbers, _ and . only" />
            <span class="pp-edit-hint">Used to login · letters, numbers, _ and .</span>
          </div>
          <div class="pp-edit-field">
            <label>Bio</label>
            <textarea id="editBio" placeholder="A short bio about yourself…" rows="2"></textarea>
          </div>
          <div class="pp-edit-row2">
            <div class="pp-edit-field">
              <label>Class</label>
              <select id="editClass">
                <option value="8">Class 8</option>
                <option value="9">Class 9</option>
                <option value="10">Class 10</option>
                <option value="11">Class 11</option>
                <option value="12">Class 12</option>
              </select>
            </div>
            <div class="pp-edit-field">
              <label>Board</label>
              <select id="editBoard">
                <option value="ICSE">ICSE</option>
                <option value="CBSE">CBSE</option>
                <option value="SSLC">SSLC</option>
              </select>
            </div>
          </div>
          <button class="pp-save-btn" id="ppSaveBtn">Save Changes</button>
          <div class="pp-save-msg" id="ppSaveMsg"></div>
        </div>
      </div>

      <!-- Actions -->
      <div class="pp-actions">
        <button class="pp-action-btn logout" onclick="logout()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logout
        </button>
      </div>

    </div><!-- /pp-loggedin -->
  </aside>`;

  document.body.insertAdjacentHTML("afterbegin", panelHTML);
}

/* ── Load profile data into the panel ── */
async function loadProfilePanel() {
  const loggedOut = document.getElementById("ppLoggedOut");
  const loggedIn  = document.getElementById("ppLoggedIn");

  if (!supabaseClient) {
    if (loggedOut) loggedOut.style.display = "";
    if (loggedIn)  loggedIn.style.display  = "none";
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    if (loggedOut) loggedOut.style.display = "";
    if (loggedIn)  loggedIn.style.display  = "none";
    return;
  }

  if (loggedOut) loggedOut.style.display = "none";
  if (loggedIn)  loggedIn.style.display  = "";

  const userId = session.user.id;
  const email  = session.user.email;

  // Fetch profile
  let { data: profile, error: fetchErr } = await supabaseClient
    .from("user_profiles").select("*").eq("id", userId).single();

  if (!profile) {
    // Try to recover from pendingProfile in localStorage
    const pending = localStorage.getItem("pendingProfile");
    const base = pending ? JSON.parse(pending) : {};
    profile = {
      id: userId, full_name: "", username: "", email,
      class_level: "10", board: "ICSE", bio: "",
      streak: 0, last_active_date: null,
      total_time_minutes: 0, questions_count: 0,
      ...base,
    };
    try {
      await supabaseClient.from("user_profiles").upsert({ ...profile });
      localStorage.removeItem("pendingProfile");
    } catch (e) {}
  }

  // Streak is updated only when a question is asked (in trackQuestionAndStreak)
  const newStreak = profile.streak || 0;

  const name      = profile.full_name || email.split("@")[0];
  const initials  = getInitials(name);
  const joined    = new Date(session.user.created_at);
  const joinedStr = joined.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  const el = id => document.getElementById(id);

  // Avatar: show uploaded photo if exists, otherwise initials
  const avatarEl = el("ppAvatar");
  if (avatarEl) {
    if (profile.avatar_url) {
      avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      avatarEl.textContent = initials;
    }
  }

  // Show/hide remove button based on whether photo exists
  const removeBtn = el("ppAvatarRemove");
  if (removeBtn) removeBtn.style.display = profile.avatar_url ? "" : "none";

  // Wire photo upload input (once)
  const photoInput = el("ppPhotoInput");
  if (photoInput && !photoInput.dataset.wired) {
    photoInput.dataset.wired = "1";
    photoInput.addEventListener("change", handleAvatarUpload);
  }

  if (el("ppName"))        el("ppName").textContent        = name;
  if (el("ppUsername"))    el("ppUsername").textContent    = profile.username ? "@" + profile.username : "";
  if (el("ppEmail"))       el("ppEmail").textContent       = email;
  if (el("ppBadgeText"))   el("ppBadgeText").textContent   = `Class ${profile.class_level} · ${profile.board}`;
  if (el("streakCount"))   el("streakCount").textContent   = newStreak;
  if (el("timeSpent")) {
    const baseEl = el("timeSpent");
    baseEl.dataset.baseMinutes = profile.total_time_minutes || 0;  // store for live ticker
    baseEl.textContent = fmtTime((profile.total_time_minutes || 0) + _elapsedMins());
  }
  if (el("questionsCount")) el("questionsCount").textContent = profile.questions_count || 0;
  if (el("ppJoinedStat"))  el("ppJoinedStat").textContent  = joinedStr;
  if (el("ppUsernameRow")) el("ppUsernameRow").textContent = profile.username ? "@" + profile.username : "—";
  if (el("ppClass"))       el("ppClass").textContent       = `Class ${profile.class_level}`;
  if (el("ppBoard"))       el("ppBoard").textContent       = profile.board;
  if (el("ppLastSubject")) el("ppLastSubject").textContent = profile.last_subject || "—";

  // Bio
  const bioSection = el("ppBioSection");
  const bioText    = el("ppBioText");
  if (bioText) {
    bioText.textContent = profile.bio || "";
    if (bioSection) bioSection.style.display = profile.bio ? "" : "none";
  }

  // Pre-fill edit form
  if (el("editName"))     el("editName").value     = profile.full_name || "";
  if (el("editUsername")) el("editUsername").value = profile.username  || "";
  if (el("editBio"))      el("editBio").value      = profile.bio       || "";
  if (el("editClass"))    el("editClass").value    = profile.class_level || "10";
  if (el("editBoard"))    el("editBoard").value    = profile.board       || "ICSE";

  // Sync dashboard selects
  const classSelect = document.getElementById("classLevel");
  const boardSelect = document.getElementById("board");
  if (classSelect && profile.class_level) classSelect.value = profile.class_level;
  if (boardSelect && profile.board)       boardSelect.value = profile.board;

  // Nav avatar — show photo or initials
  const navTrigger = document.getElementById("profileTriggerNav");
  if (navTrigger) {
    if (profile.avatar_url) {
      navTrigger.innerHTML = `<img src="${profile.avatar_url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      navTrigger.style.padding = "0";
      navTrigger.style.overflow = "hidden";
    } else {
      navTrigger.textContent = initials;
    }
  }
}

/* ── Handle avatar photo upload ── */
async function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  if (!file || !supabaseClient) return;

  // Validate: image, max 3MB
  if (!file.type.startsWith("image/")) {
    alert("Please select an image file.");
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    alert("Image must be under 3MB.");
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  // Show uploading state
  const avatarEl  = document.getElementById("ppAvatar");
  const navEl     = document.getElementById("profileTriggerNav");
  const origInner = avatarEl?.innerHTML;
  if (avatarEl) avatarEl.innerHTML = '<span style="font-size:0.7rem;opacity:0.6;">…</span>';

  try {
    const ext      = file.name.split(".").pop();
    const path     = `${session.user.id}/avatar.${ext}`;
    const bucket   = "avatars";

    // Upload to Supabase Storage
    const { error: upErr } = await supabaseClient.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) throw upErr;

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from(bucket)
      .getPublicUrl(path);
    const avatarUrl = urlData?.publicUrl + "?t=" + Date.now(); // bust cache

    // Save URL to profile
    await supabaseClient
      .from("user_profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", session.user.id);

    // Update UI
    const imgHtml = `<img src="${avatarUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    if (avatarEl) avatarEl.innerHTML = imgHtml;
    if (navEl) {
      navEl.innerHTML = imgHtml;
      navEl.style.padding = "0";
      navEl.style.overflow = "hidden";
    }
    // Show remove button now that a photo exists
    const removeBtn = document.getElementById("ppAvatarRemove");
    if (removeBtn) removeBtn.style.display = "";
  } catch (err) {
    if (avatarEl) avatarEl.innerHTML = origInner || "?";
    alert("Upload failed. Make sure the 'avatars' storage bucket exists in Supabase.");
  } finally {
    e.target.value = ""; // allow re-upload same file
  }
}

/* ── Remove avatar photo ── */
async function removeAvatar() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  const avatarEl  = document.getElementById("ppAvatar");
  const navEl     = document.getElementById("profileTriggerNav");
  const removeBtn = document.getElementById("ppAvatarRemove");

  try {
    // Delete from storage — path is userId/avatar.*
    const { data: files } = await supabaseClient.storage
      .from("avatars")
      .list(session.user.id);

    if (files && files.length > 0) {
      const paths = files.map(f => `${session.user.id}/${f.name}`);
      await supabaseClient.storage.from("avatars").remove(paths);
    }

    // Clear avatar_url in profile
    await supabaseClient
      .from("user_profiles")
      .update({ avatar_url: null })
      .eq("id", session.user.id);

    // Revert UI to initials
    const name     = document.getElementById("ppName")?.textContent || session.user.email;
    const initials = getInitials(name);

    if (avatarEl) {
      avatarEl.textContent = initials;
    }
    if (navEl) {
      navEl.textContent = initials;
      navEl.style.padding = "";
      navEl.style.overflow = "";
      navEl.innerHTML = initials; // clear any img
    }
    if (removeBtn) removeBtn.style.display = "none";

  } catch (err) {
    alert("Could not remove photo. Try again.");
  }
}

/* ── Save profile edits ── */
async function saveProfileEdits() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return;

  const name        = document.getElementById("editName")?.value.trim() || "";
  const newUsername = document.getElementById("editUsername")?.value.trim().toLowerCase() || "";
  const bio         = document.getElementById("editBio")?.value.trim() || "";
  const cls         = document.getElementById("editClass")?.value;
  const board       = document.getElementById("editBoard")?.value;
  const msgEl       = document.getElementById("ppSaveMsg");

  const setMsg = (txt, color = "#f87171") => {
    if (msgEl) { msgEl.textContent = txt; msgEl.style.color = color; }
  };

  if (newUsername) {
    if (!/^[a-zA-Z0-9_.]+$/.test(newUsername)) { setMsg("Username: letters, numbers, _ and . only."); return; }
    if (newUsername.length < 3) { setMsg("Username must be at least 3 characters."); return; }
    const { data: taken } = await supabaseClient.from("user_profiles")
      .select("id").eq("username", newUsername).neq("id", session.user.id).limit(1);
    if (taken && taken.length > 0) { setMsg("Username already taken."); return; }
  }

  try {
    const ppSaveBtn = document.getElementById("ppSaveBtn");
    if (ppSaveBtn) { ppSaveBtn.disabled = true; ppSaveBtn.textContent = "Saving…"; }

    await supabaseClient.from("user_profiles")
      .update({ full_name: name, username: newUsername, bio, class_level: cls, board })
      .eq("id", session.user.id);

    const el = id => document.getElementById(id);
    if (el("ppName"))      el("ppName").textContent      = name || session.user.email.split("@")[0];
    if (el("ppAvatar"))    el("ppAvatar").textContent    = getInitials(name || session.user.email);
    if (el("ppUsername"))  el("ppUsername").textContent  = newUsername ? "@" + newUsername : "";
    if (el("ppUsernameRow")) el("ppUsernameRow").textContent = newUsername ? "@" + newUsername : "—";
    if (el("ppBadgeText")) el("ppBadgeText").textContent = `Class ${cls} · ${board}`;
    if (el("ppClass"))     el("ppClass").textContent     = `Class ${cls}`;
    if (el("ppBoard"))     el("ppBoard").textContent     = board;
    const bioSection = el("ppBioSection"), bioText = el("ppBioText");
    if (bioText) { bioText.textContent = bio; if (bioSection) bioSection.style.display = bio ? "" : "none"; }
    const navTrigger = document.getElementById("profileTriggerNav");
    if (navTrigger && !navTrigger.querySelector("img")) {
      navTrigger.textContent = getInitials(name);
    } else if (navTrigger && navTrigger.querySelector("img")) {
      // Already showing photo — just keep it
    }
    const classSelect = document.getElementById("classLevel");
    const boardSelect = document.getElementById("board");
    if (classSelect) classSelect.value = cls;
    if (boardSelect) boardSelect.value = board;

    setMsg("Saved ✓", "#10b981");
    if (ppSaveBtn) { ppSaveBtn.disabled = false; ppSaveBtn.textContent = "Save Changes"; }
    setTimeout(() => setMsg(""), 2500);
  } catch (e) {
    setMsg("Save failed. Try again.");
    const ppSaveBtn = document.getElementById("ppSaveBtn");
    if (ppSaveBtn) { ppSaveBtn.disabled = false; ppSaveBtn.textContent = "Save Changes"; }
  }
}

/* ── Track question + streak in one DB call (called on every send) ── */
async function trackQuestionAndStreak() {
  if (!supabaseClient) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const subject = document.getElementById("subject")?.value || null;

    // Use IST date so streak doesn't flip at 5:30 AM IST (midnight UTC)
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD in IST

    const { data: row } = await supabaseClient
      .from("user_profiles")
      .select("questions_count, streak, best_streak, last_active_date, last_subject")
      .eq("id", session.user.id)
      .single();

    if (!row) return;

    // ── Streak: only advances when a question is asked on a NEW day ──
    let newStreak = row.streak || 0;
    let newDate   = row.last_active_date;

    // Handle first time user (no last_active_date set OR streak is still 0)
    if (!newDate || newStreak === 0) {
      newStreak = 1;
      newDate = today;
    } else if (newDate !== today) {
      // Calculate yesterday in IST
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      const yStr = yDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

      if (newDate === yStr) {
        newStreak += 1;   // asked yesterday + today = streak continues
      } else {
        newStreak = 1;    // gap of 2+ days = streak resets to 1
      }
      newDate = today;
    }
    // If last_active_date === today and streak > 0, streak stays as-is (already counted today's question)

    const newCount = (row.questions_count || 0) + 1;

    // ── Best streak: update if current streak surpasses it ──
    const currentBest = row.best_streak || 0;
    const newBest = newStreak > currentBest ? newStreak : currentBest;

    const update = {
      questions_count:  newCount,
      streak:           newStreak,
      best_streak:      newBest,
      last_active_date: newDate,
    };
    if (subject) update.last_subject = subject;

    await supabaseClient.from("user_profiles")
      .update(update)
      .eq("id", session.user.id);

    // Update profile panel UI live
    const el = id => document.getElementById(id);
    if (el("questionsCount")) el("questionsCount").textContent = newCount;
    if (el("streakCount"))    el("streakCount").textContent    = newStreak;
    if (subject && el("ppLastSubject")) el("ppLastSubject").textContent = subject;
  } catch (e) { /* silent — non-critical */ }
}

/* initPasswordToggles removed — eye toggle is handled inline per-page */

/* ── Open / close ── */
function openProfilePanel() {
  document.getElementById("profilePanel")?.classList.add("open");
  document.getElementById("profileOverlay")?.classList.add("open");
  document.getElementById("menuDropdown")?.classList.remove("open");
}
function closeProfilePanel() {
  document.getElementById("profilePanel")?.classList.remove("open");
  document.getElementById("profileOverlay")?.classList.remove("open");
}

/* ── Update nav Login/Logout visibility based on session ── */
async function updateNavAuthLinks() {
  const loginLink = document.getElementById("navLoginLink");
  const logoutBtn = document.getElementById("navLogoutBtn");

  let session = null;
  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    session = data?.session ?? null;
  }

  if (loginLink)  loginLink.style.display  = session ? "none" : "";
  if (logoutBtn)  logoutBtn.style.display  = session ? ""     : "none";
}

/* ── Real-time username availability check on signup page ── */
function initUsernameCheck() {
  const input = document.getElementById("username");
  if (!input || !supabaseClient) return;

  let timer = null;
  let indicator = document.createElement("span");
  indicator.style.cssText = "font-size:0.72rem;margin-top:2px;display:block;min-height:16px;transition:color 0.2s;";
  input.parentNode.appendChild(indicator);

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const val = input.value.trim().toLowerCase();
    indicator.textContent = "";
    input.setCustomValidity("");

    if (!val) return;
    if (val.length < 3) {
      indicator.style.color = "#f59e0b";
      indicator.textContent = "At least 3 characters";
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(val)) {
      indicator.style.color = "#f87171";
      indicator.textContent = "Letters, numbers, _ and . only";
      input.setCustomValidity("Invalid characters");
      return;
    }

    indicator.style.color = "#9ca3af";
    indicator.textContent = "Checking…";

    timer = setTimeout(async () => {
      const { data } = await supabaseClient
        .from("user_profiles")
        .select("id")
        .eq("username", val)
        .limit(1);

      if (data && data.length > 0) {
        indicator.style.color = "#f87171";
        indicator.textContent = "✗ Username already taken";
        input.setCustomValidity("Username taken");
      } else {
        indicator.style.color = "#10b981";
        indicator.textContent = "✓ Username available";
        input.setCustomValidity("");
      }
    }, 500);
  });
}

/* ── Real-time email availability check on signup page ── */
function initEmailCheck() {
  const input = document.getElementById("email");
  if (!input || !supabaseClient) return;

  // Only run on signup page
  if (!document.getElementById("signupBtn")) return;

  let timer = null;
  let indicator = document.createElement("span");
  indicator.style.cssText = "font-size:0.72rem;margin-top:2px;display:block;min-height:16px;transition:color 0.2s;";
  input.parentNode.appendChild(indicator);

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const val = input.value.trim().toLowerCase();
    indicator.textContent = "";
    input.setCustomValidity("");

    if (!val) return;

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      indicator.style.color = "#f59e0b";
      indicator.textContent = "Enter a valid email";
      return;
    }

    indicator.style.color = "#9ca3af";
    indicator.textContent = "Checking…";

    timer = setTimeout(async () => {
      const { data } = await supabaseClient
        .from("user_profiles")
        .select("id")
        .eq("email", val)
        .limit(1);

      if (data && data.length > 0) {
        indicator.style.color = "#f87171";
        indicator.textContent = "✗ Email already registered";
        input.setCustomValidity("Email already registered");
      } else {
        indicator.style.color = "#10b981";
        indicator.textContent = "✓ Email not registered";
        input.setCustomValidity("");
      }
    }, 500);
  });
}

/* ── Wire everything on DOMContentLoaded (runs on every page) ── */
document.addEventListener("DOMContentLoaded", async () => {
  // Inject profile panel HTML into every page
  injectProfilePanel();

  // Load panel data (shows logged-out state if no session)
  await loadProfilePanel();

  // Update Login/Logout nav links
  await updateNavAuthLinks();

  // Open/close bindings
  document.getElementById("profileTriggerNav")?.addEventListener("click", openProfilePanel);
  document.getElementById("profileTriggerMenu")?.addEventListener("click", openProfilePanel);
  document.getElementById("profileClose")?.addEventListener("click", closeProfilePanel);
  document.getElementById("profileOverlay")?.addEventListener("click", closeProfilePanel);
  document.getElementById("ppSaveBtn")?.addEventListener("click", saveProfileEdits);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeProfilePanel(); });

  // Real-time username availability check
  initUsernameCheck();

  // Real-time email availability check
  initEmailCheck();

  // Forgot password modal handlers
  document.getElementById("forgotPasswordLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    openForgotPasswordModal();
  });
  document.getElementById("cancelForgotBtn")?.addEventListener("click", closeForgotPasswordModal);
  document.getElementById("forgotPasswordForm")?.addEventListener("submit", forgotPassword);
  document.querySelector(".forgot-pw-overlay")?.addEventListener("click", closeForgotPasswordModal);

  // Question tracking is now done inside sendQuestion() directly
});