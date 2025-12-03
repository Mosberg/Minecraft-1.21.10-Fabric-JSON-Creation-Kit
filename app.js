// app.js - Minecraft 1.21.10 Fabric JSON Creation Kit
class JsonCreationKit {
  constructor() {
    this.schemaRegistry = this.initSchemaRegistry();
    this.currentTabId = null;
    this.tabs = new Map();
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    this.settings = this.loadSettings();
    this.init();
  }

  initSchemaRegistry() {
    return {
      item: {
        name: "Item Definitions",
        category: "items",
        icon: "🎒",
        description: "Custom items with components & properties",
        templates: ["basic_item", "tool", "armor"],
      },
      block: {
        name: "Block Definitions",
        category: "blocks",
        icon: "🧱",
        description: "Custom blocks with geometry & rendering",
        templates: ["cube_block", "custom_geometry"],
      },
      recipe_shaped: {
        name: "Shaped Recipes",
        category: "recipes",
        icon: "⚒️",
        description: "Grid-based crafting recipes",
        templates: ["3x3_crafting"],
      },
      loottable: {
        name: "Loot Tables",
        category: "loottables",
        icon: "💎",
        description: "Advanced loot generation systems",
        templates: ["block_loot"],
      },
      modjson: {
        name: "Fabric mod.json",
        category: "fabric",
        icon: "⚙️",
        description: "Mod metadata & configuration",
      },
    };
  }

  init() {
    this.bindEvents();
    this.populateSchemaSelect();
    this.loadStarterTemplates();
    this.updateStatus(
      "Ready - Loaded " + Object.keys(this.schemaRegistry).length + " schemas"
    );
  }

  bindEvents() {
    // Global shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        this.showSchemaModal();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "B") {
        e.preventDefault();
        this.showBatchModal();
      }
    });

    // Toolbar buttons
    document.getElementById("newJsonBtn").onclick = () =>
      this.showSchemaModal();
    document.getElementById("batchBtn").onclick = () => this.showBatchModal();
    document.getElementById("quickItemBtn").onclick = () =>
      this.quickTemplate("item", "basic_item");
    document.getElementById("quickBlockBtn").onclick = () =>
      this.quickTemplate("block", "cube_block");
    document.getElementById("quickRecipeBtn").onclick = () =>
      this.quickTemplate("recipe_shaped", "3x3_crafting");

    // Modals
    document.getElementById("cancelSchemaBtn").onclick = () =>
      this.hideModal("schemaModal");
    document.getElementById("settingsBtn").onclick = () =>
      this.showSettingsModal();
  }

  populateSchemaSelect() {
    const select = document.getElementById("schemaSelect");
    Object.entries(this.schemaRegistry).forEach(([id, schema]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${schema.icon} ${schema.name}`;
      select.appendChild(option);
    });

    select.onchange = (e) => {
      const schemaId = e.target.value;
      if (schemaId) {
        this.createNewTab(schemaId);
      }
    };
  }

  async createNewTab(schemaId, templateId = null) {
    const tabId = `tab_${Date.now()}`;
    const schema = this.schemaRegistry[schemaId];

    // Create tab
    const tabHtml = `
            <div class="tab-item ${
              templateId ? "valid" : ""
            }" data-tab="${tabId}">
                ${schema.icon} ${schema.name}
            </div>
        `;
    document.getElementById("tabList").innerHTML += tabHtml;

    // Create editor panel
    const editorHtml = this.createEditorPanel(tabId, schemaId);
    document.getElementById("editorArea").innerHTML = editorHtml;

    // Load template if specified
    if (templateId) {
      const template = await this.loadTemplate(templateId);
      if (template) {
        this.loadJsonToEditor(tabId, template);
      }
    }

    this.switchTab(tabId);
    this.showEditorContainer();
    this.bindTabEvents(tabId);
  }

  createEditorPanel(tabId, schemaId) {
    return `
            <div class="editor-panel" data-tab="${tabId}">
                <div class="editor-toolbar">
                    <button class="btn-icon" onclick="kit.loadTemplateDialog('${tabId}')">📋</button>
                    <button class="btn-icon validate-btn" onclick="kit.validateTab('${tabId}')">✅</button>
                    <button class="btn-icon" onclick="kit.exportTab('${tabId}')">💾</button>
                    <button class="btn-icon" onclick="kit.beautifyTab('${tabId}')">✨</button>
                    <span class="validation-status" id="status_${tabId}">Ready</span>
                </div>
                <div id="monacoContainer_${tabId}" style="height: calc(100% - 50px);"></div>
                <div class="properties-panel">
                    <div class="properties-tree" id="props_${tabId}"></div>
                </div>
            </div>
        `;
  }

  async initMonaco(tabId) {
    const container = document.getElementById(`monacoContainer_${tabId}`);
    require.config({
      paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs" },
    });

    require(["vs/editor/editor.main"], () => {
      this.editors = this.editors || new Map();
      this.editors.set(
        tabId,
        monaco.editor.create(container, {
          value: "{}",
          language: "json",
          theme: "vs-dark",
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: "off",
        })
      );

      this.editors.get(tabId).onDidChangeModelContent(() => {
        this.debounce(() => this.validateTab(tabId), 500)();
      });
    });
  }

  switchTab(tabId) {
    if (this.currentTabId) {
      const oldTab = document.querySelector(
        `[data-tab="${this.currentTabId}"]`
      );
      if (oldTab) oldTab.classList.remove("active");
    }

    this.currentTabId = tabId;
    const tab = document.querySelector(`[data-tab="${tabId}"]`);
    tab.classList.add("active");

    // Switch editor visibility
    document.querySelectorAll(".editor-panel").forEach((panel) => {
      panel.style.display = panel.dataset.tab === tabId ? "flex" : "none";
    });

    if (!this.editors?.has(tabId)) {
      this.initMonaco(tabId);
    }
  }

  bindTabEvents(tabId) {
    document.querySelectorAll(`[data-tab="${tabId}"]`).forEach((el) => {
      el.onclick = () => this.switchTab(tabId);
    });

    document.getElementById("closeTabBtn").onclick = () => this.closeTab(tabId);
  }

  async validateTab(tabId) {
    const editor = this.editors.get(tabId);
    if (!editor) return;

    try {
      const content = editor.getValue();
      const json = JSON.parse(content);
      const schemaId = this.getSchemaIdFromTab(tabId);
      const schema = await this.loadSchema(schemaId);

      if (schema) {
        const valid = this.ajv.validate(schema, json);
        const statusEl = document.getElementById(`status_${tabId}`);
        const tabEl = document.querySelector(`[data-tab="${tabId}"]`);

        if (valid) {
          statusEl.textContent = "✅ VALID";
          statusEl.className = "validation-status valid";
          tabEl.classList.add("valid");
          tabEl.classList.remove("invalid");
        } else {
          const errors = this.formatAjvErrors(this.ajv.errors);
          statusEl.textContent = `❌ ${errors[0]?.substring(0, 50)}...`;
          statusEl.className = "validation-status invalid";
          tabEl.classList.add("invalid");
          tabEl.classList.remove("valid");
        }
      }
    } catch (e) {
      const statusEl = document.getElementById(`status_${tabId}`);
      statusEl.textContent = `💥 Syntax Error: ${e.message.substring(0, 50)}`;
      statusEl.className = "validation-status invalid";
    }
  }

  async loadTemplate(templateId) {
    // Starter templates - replace with actual file loading
    const templates = {
      basic_item: {
        format_version: "1.21.10",
        "minecraft:item": {
          description: {
            identifier: "mymod:my_item",
            menu_category: { category: "items" },
          },
          components: {
            "minecraft:icon": { texture: "my_item" },
            "minecraft:max_stack_size": 64,
          },
        },
      },
      cube_block: {
        format_version: "1.21.10",
        "minecraft:client_entity": {
          description: {
            identifier: "mymod:my_block",
            menu_category: { category: "construction" },
          },
          materials: [{ json: "minecraft:geometry", texture: "stone" }],
          textures: { 0: "minecraft:block/stone" },
          geometry: { default: "geometry.cube" },
        },
      },
    };
    return templates[templateId] || {};
  }

  showSchemaModal() {
    const modal = document.getElementById("schemaModal");
    const categoriesEl = document.getElementById("schemaCategories");
    categoriesEl.innerHTML = "";

    Object.entries(this.schemaRegistry).forEach(([id, schema]) => {
      const card = document.createElement("div");
      card.className = "schema-card";
      card.dataset.schema = id;
      card.innerHTML = `
                <h4>${schema.icon} ${schema.name}</h4>
                <p>${schema.description}</p>
                <div style="margin-top: 12px;">
                    ${
                      schema.templates
                        ?.map((t) => `<span class="template-tag">${t}</span>`)
                        .join("") || ""
                    }
                </div>
            `;
      card.onclick = () => this.selectSchema(id, card);
      categoriesEl.appendChild(card);
    });

    modal.classList.add("active");
    document.getElementById("createJsonBtn").disabled = true;
  }

  selectSchema(schemaId, cardEl) {
    document
      .querySelectorAll(".schema-card")
      .forEach((c) => c.classList.remove("selected"));
    cardEl.classList.add("selected");
    document.getElementById("createJsonBtn").dataset.schema = schemaId;
    document.getElementById("createJsonBtn").disabled = false;
  }

  async quickTemplate(schemaId, templateId) {
    await this.createNewTab(schemaId, templateId);
  }

  showEditorContainer() {
    document.getElementById("welcomeScreen").classList.remove("active");
    document.getElementById("editorContainer").style.display = "flex";
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  loadSettings() {
    return JSON.parse(localStorage.getItem("jsonkit-settings") || "{}");
  }

  updateStatus(message) {
    document.getElementById("statusLabel").textContent = message;
  }

  // Placeholder implementations for full functionality
  loadTemplateDialog(tabId) {
    console.log("Load template for", tabId);
  }
  exportTab(tabId) {
    console.log("Export tab", tabId);
  }
  beautifyTab(tabId) {
    console.log("Beautify tab", tabId);
  }
  closeTab(tabId) {
    console.log("Close tab", tabId);
  }
  getSchemaIdFromTab(tabId) {
    return "item";
  } // Simplified
  loadSchema(schemaId) {
    return {};
  } // Load from files
  formatAjvErrors(errors) {
    return errors?.map((e) => e.message) || [];
  }
  showBatchModal() {
    document.getElementById("batchModal").classList.add("active");
  }
  showSettingsModal() {
    document.getElementById("settingsModal").classList.add("active");
  }
  hideModal(modalId) {
    document.getElementById(modalId).classList.remove("active");
  }
  loadStarterTemplates() {
    /* Load from resources/templates */
  }
  loadJsonToEditor(tabId, json) {
    const editor = this.editors?.get(tabId);
    if (editor) editor.setValue(JSON.stringify(json, null, 2));
  }
}

// Global kit instance
const kit = new JsonCreationKit();
