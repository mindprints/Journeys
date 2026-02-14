class CategoryEditor {
  constructor() {
    this.categories = [];
    this.configCategories = [];
    this.currentIndex = null;
    this.slugDirty = false;
    this.apiBase = this.resolveApiBase();
    this.init();
  }

  normalizeCategoryKey(value) {
    return (value || '').trim().toLowerCase();
  }

  resolveApiBase() {
    if (window.location.protocol === 'file:') {
      return 'http://localhost:3010';
    }
    return '';
  }

  buildApiUrl(endpoint) {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }
    return `${this.apiBase}${endpoint}`;
  }

  async requestJson(endpoint, options = {}, fallbackErrorMessage = 'Request failed') {
    const url = this.buildApiUrl(endpoint);
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      throw new Error(`Could not reach API (${url}). Start server.js and try again.`);
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message = isJson
        ? (payload?.error || payload?.message || fallbackErrorMessage)
        : `${fallbackErrorMessage} (${response.status})`;
      throw new Error(message);
    }

    return payload;
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadConfig();
  }

  cacheElements() {
    this.categoryList = document.getElementById('category-list');
    this.newBtn = document.getElementById('new-category-btn');
    this.refreshBtn = document.getElementById('refresh-config-btn');
    this.saveBtn = document.getElementById('save-category-btn');
    this.deleteBtn = document.getElementById('delete-category-btn');
    this.resetBtn = document.getElementById('reset-category-btn');
    this.generateBtn = document.getElementById('generate-category-btn');

    this.nameInput = document.getElementById('category-name');
    this.slugInput = document.getElementById('category-slug');
    this.descriptionInput = document.getElementById('category-description');
    this.colorInput = document.getElementById('category-color');
    this.colorChip = document.getElementById('color-chip');
    this.colorLabel = document.getElementById('color-label');
    this.countInput = document.getElementById('category-count');
    this.sourceInput = document.getElementById('category-source');
    this.topicsInput = document.getElementById('category-topics');
    this.refreshTopicsBtn = document.getElementById('refresh-topics-btn');
    this.suggestTopicsBtn = document.getElementById('suggest-topics-btn');
    this.topicSuggestionsDraft = document.getElementById('topic-suggestions-draft');
    this.applySuggestionsBtn = document.getElementById('apply-suggestions-btn');
    this.replaceTopicsBtn = document.getElementById('replace-topics-btn');
    this.clearSuggestionsBtn = document.getElementById('clear-suggestions-btn');

    this.modal = document.getElementById('generator-modal');
    this.closeModalBtn = document.getElementById('close-generator');
    this.cancelModalBtn = document.getElementById('cancel-generator');
    this.runBtn = document.getElementById('run-generator');
    this.mergeCheckbox = document.getElementById('generator-merge');
    this.mergeOnlyCheckbox = document.getElementById('generator-merge-only');
    this.generatorCount = document.getElementById('generator-count');
    this.generatorTopics = document.getElementById('generator-topics');
    this.generatorLog = document.getElementById('generator-log');
    this.loadRunLogBtn = document.getElementById('load-run-log');
    this.loadMergeLogBtn = document.getElementById('load-merge-log');
    this.clearLogBtn = document.getElementById('clear-log');
  }

  bindEvents() {
    this.newBtn.addEventListener('click', () => this.startNewCategory());
    this.refreshBtn.addEventListener('click', () => this.loadConfig());
    this.saveBtn.addEventListener('click', () => this.saveCategory());
    this.deleteBtn.addEventListener('click', () => this.deleteCategory());
    this.resetBtn.addEventListener('click', () => this.resetForm());
    this.generateBtn.addEventListener('click', () => this.openGenerator());

    this.nameInput.addEventListener('input', () => this.handleNameInput());
    this.slugInput.addEventListener('input', () => {
      this.slugDirty = true;
    });
    this.colorInput.addEventListener('input', () => this.updateColorPreview());

    this.closeModalBtn.addEventListener('click', () => this.closeGenerator());
    this.cancelModalBtn.addEventListener('click', () => this.closeGenerator());
    this.runBtn.addEventListener('click', () => this.runGenerator());
    this.loadRunLogBtn.addEventListener('click', () => this.loadLog('/api/grab-log'));
    this.loadMergeLogBtn.addEventListener('click', () => this.loadLog('/api/merge-enrichment-log'));
    this.clearLogBtn.addEventListener('click', () => {
      this.generatorLog.textContent = '';
    });
    if (this.refreshTopicsBtn) {
      this.refreshTopicsBtn.addEventListener('click', () => {
        const category = this.categories[this.currentIndex];
        const categoryName = category?.value || category?.name || category?.slug || '';
        this.populateTopicsFromPosters(categoryName, true);
      });
    }
    if (this.suggestTopicsBtn) {
      this.suggestTopicsBtn.addEventListener('click', () => this.suggestTopicsFromAI());
    }
    if (this.applySuggestionsBtn) {
      this.applySuggestionsBtn.addEventListener('click', () => this.applySuggestionsToTopics(false));
    }
    if (this.replaceTopicsBtn) {
      this.replaceTopicsBtn.addEventListener('click', () => this.applySuggestionsToTopics(true));
    }
    if (this.clearSuggestionsBtn) {
      this.clearSuggestionsBtn.addEventListener('click', () => {
        if (this.topicSuggestionsDraft) {
          this.topicSuggestionsDraft.value = '';
        }
      });
    }
  }

  async loadConfig() {
    try {
      const [config, posterCategories] = await Promise.all([
        this.requestJson('/api/category-config', {}, 'Failed to load category config'),
        this.requestJson('/api/categories', {}, 'Failed to load categories')
      ]);

      this.configCategories = Array.isArray(config.categories) ? config.categories : [];
      this.categories = this.mergeCategories(this.configCategories, posterCategories);
      this.renderList();
      if (this.categories.length) {
        this.selectCategory(0);
      } else {
        this.startNewCategory();
      }
    } catch (error) {
      console.error('Error loading category config:', error);
    }
  }

  mergeCategories(configCategories, posterCategories) {
    const merged = [];
    const indexMap = new Map();

    configCategories.forEach((category, index) => {
      const key = this.normalizeCategoryKey(category.name || category.slug);
      if (!key) return;
      const entry = {
        ...category,
        managed: true,
        configIndex: index,
        key,
        value: category.name || category.slug || ''
      };
      merged.push(entry);
      indexMap.set(key, entry);
    });

    if (Array.isArray(posterCategories)) {
      posterCategories.forEach(category => {
        const rawValue = category?.value || category?.name || '';
        const name = rawValue;
        const key = this.normalizeCategoryKey(rawValue);
        if (!key || indexMap.has(key)) return;
        merged.push({
          name,
          value: rawValue,
          key,
          slug: this.slugify(rawValue || name),
          description: '',
          color: '#f48c06',
          targetCount: null,
          source: 'wikipedia',
          topics: [],
          managed: false,
          configIndex: null
        });
      });
    }

    return merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  renderList() {
    this.categoryList.innerHTML = '';
    this.categories.forEach((category, index) => {
      const item = document.createElement('div');
      item.className = 'category-item';
      if (index === this.currentIndex) {
        item.classList.add('active');
      }

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = category.name || 'Untitled';

      const pill = document.createElement('span');
      pill.className = 'pill';
      if (category.managed) {
        pill.textContent = (category.slug || 'new').toUpperCase();
      } else {
        pill.textContent = 'POSTER';
      }

      item.appendChild(label);
      item.appendChild(pill);
      item.addEventListener('click', () => this.selectCategory(index));
      this.categoryList.appendChild(item);
    });
  }

  selectCategory(index) {
    this.currentIndex = index;
    this.slugDirty = false;
    const category = this.categories[index];
    if (!category) return;

    const hasTopics = Array.isArray(category.topics) && category.topics.length > 0;
    this.nameInput.value = category.name || '';
    this.slugInput.value = category.slug || '';
    this.descriptionInput.value = category.description || '';
    this.colorInput.value = category.color || '#f48c06';
    this.countInput.value = category.targetCount || '';
    this.sourceInput.value = category.source || 'wikipedia';
    this.topicsInput.value = (category.topics || []).join('\n');
    if (this.topicSuggestionsDraft) {
      this.topicSuggestionsDraft.value = '';
    }
    this.deleteBtn.disabled = false;
    this.updateColorPreview();
    this.renderList();

    if (!hasTopics && !category.managed) {
      const categoryName = category.value || category.name || category.slug || '';
      this.populateTopicsFromPosters(categoryName, false);
    }
  }

  startNewCategory() {
    this.currentIndex = null;
    this.slugDirty = false;
    this.nameInput.value = '';
    this.slugInput.value = '';
    this.descriptionInput.value = '';
    this.colorInput.value = '#f48c06';
    this.countInput.value = '';
    this.sourceInput.value = 'wikipedia';
    this.topicsInput.value = '';
    if (this.topicSuggestionsDraft) {
      this.topicSuggestionsDraft.value = '';
    }
    this.deleteBtn.disabled = true;
    this.updateColorPreview();
    this.renderList();
  }

  resetForm() {
    if (this.currentIndex === null) {
      this.startNewCategory();
    } else {
      this.selectCategory(this.currentIndex);
    }
  }

  handleNameInput() {
    if (!this.slugDirty) {
      this.slugInput.value = this.slugify(this.nameInput.value);
    }
  }

  updateColorPreview() {
    const value = this.colorInput.value || '#f48c06';
    this.colorChip.style.background = value;
    this.colorLabel.textContent = value;
  }

  slugify(value) {
    return (value || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
  }

  buildCategoryPayload() {
    const name = this.nameInput.value.trim();
    const slug = (this.slugInput.value || this.slugify(name)).trim();
    const topics = this.parseTopics(this.topicsInput.value);
    const targetCount = this.countInput.value ? parseInt(this.countInput.value, 10) : null;

    return {
      name,
      slug,
      description: this.descriptionInput.value.trim(),
      color: this.colorInput.value || '#f48c06',
      targetCount,
      source: this.sourceInput.value || 'wikipedia',
      topics
    };
  }

  parseTopics(raw) {
    const seen = new Set();
    return raw
      .split(/\n|,/)
      .map(value => value.trim())
      .filter(Boolean)
      .filter(topic => {
        const key = topic.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  findConfigIndexForCategory(category) {
    if (!category) return -1;
    if (Number.isInteger(category.configIndex) && this.configCategories[category.configIndex]) {
      const candidate = this.configCategories[category.configIndex];
      const categoryKey = this.normalizeCategoryKey(category.name || category.slug);
      const candidateKey = this.normalizeCategoryKey(candidate.name || candidate.slug);
      if (candidateKey === categoryKey) {
        return category.configIndex;
      }
    }

    const lookupKey = this.normalizeCategoryKey(category.name || category.slug || category.value);
    return this.configCategories.findIndex(item =>
      this.normalizeCategoryKey(item.name || item.slug) === lookupKey
    );
  }

  async populateTopicsFromPosters(categoryName, forceRefresh = false) {
    if (!categoryName) return;
    const existingTopics = forceRefresh ? this.parseTopics(this.topicsInput.value) : [];
    if (!forceRefresh && this.topicsInput.value.trim()) return;
    try {
      const posters = await this.requestJson(
        `/api/posters-in-category?category=${encodeURIComponent(categoryName)}`,
        {},
        'Failed to load posters for category'
      );
      const topics = new Set();

      existingTopics.forEach(topic => topics.add(topic));

      posters.forEach(poster => {
        const meta = poster.meta || poster.data?.meta || poster.data || {};
        const source = meta.source || '';
        if (typeof source === 'string' && source.includes('wikipedia.org/wiki/')) {
          try {
            const url = new URL(source);
            const match = url.pathname.match(/\/wiki\/(.+)$/);
            if (match && match[1]) {
              topics.add(decodeURIComponent(match[1]));
            }
          } catch (error) {
            // Ignore invalid URLs
          }
        }

        const tags = meta.tags || [];
        if (Array.isArray(tags)) {
          tags.forEach(tag => {
            if (typeof tag === 'string' && tag.trim()) {
              topics.add(tag.trim().replace(/\s+/g, '_'));
            }
          });
        }
      });

      const sortedTopics = Array.from(topics).sort((a, b) => a.localeCompare(b));
      if (sortedTopics.length) {
        this.topicsInput.value = sortedTopics.join('\n');
      }
    } catch (error) {
      console.error('Error loading topics from posters:', error);
    }
  }

  async suggestTopicsFromAI() {
    const categoryDescription = this.descriptionInput.value.trim();
    if (!categoryDescription) {
      window.alert('Enter a category description first. Suggestions are based on description context.');
      return;
    }

    const categoryName = this.nameInput.value.trim();
    const source = this.sourceInput.value || 'wikipedia';
    const existingTopics = this.parseTopics(this.topicsInput.value);
    const limit = 12;

    try {
      const data = await this.requestJson('/api/ai/topic-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName,
          categoryDescription,
          source,
          existingTopics,
          limit
        })
      }, 'Failed to fetch AI suggestions');
      const results = Array.isArray(data?.topics) ? data.topics : [];
      const seen = new Set(existingTopics.map(topic => topic.toLowerCase()));
      const staged = [];
      results.forEach(topic => {
        if (typeof topic !== 'string') return;
        const normalized = topic.trim().replace(/\s+/g, '_');
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        staged.push(normalized);
      });
      if (this.topicSuggestionsDraft) {
        this.topicSuggestionsDraft.value = staged.join('\n');
      }
      if (!staged.length) {
        window.alert('No new suggestions returned. Try refining the description.');
      }
    } catch (error) {
      console.error('Error fetching AI suggestions:', error);
      window.alert(`Could not load AI suggestions: ${error.message}`);
    }
  }

  applySuggestionsToTopics(replace = false) {
    const draftTopics = this.parseTopics(this.topicSuggestionsDraft?.value || '');
    if (!draftTopics.length) {
      window.alert('No staged suggestions to apply.');
      return;
    }

    if (replace) {
      this.topicsInput.value = draftTopics.join('\n');
      return;
    }

    const currentTopics = this.parseTopics(this.topicsInput.value);
    const merged = this.parseTopics([...currentTopics, ...draftTopics].join('\n'));
    this.topicsInput.value = merged.join('\n');
  }

  async saveCategory() {
    const payload = this.buildCategoryPayload();
    if (!payload.name) {
      window.alert('Category name is required.');
      return;
    }

    if (this.currentIndex === null) {
      this.configCategories.push(payload);
    } else {
      const current = this.categories[this.currentIndex];
      const configIndex = this.findConfigIndexForCategory(current);
      if (configIndex !== -1) {
        this.configCategories[configIndex] = payload;
      } else {
        this.configCategories.push(payload);
      }
    }

    try {
      await this.requestJson('/api/category-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: this.configCategories })
      }, 'Failed to save category config');
      await this.loadConfig();
    } catch (error) {
      console.error('Error saving category config:', error);
    }
  }

  async deleteCategory() {
    if (this.currentIndex === null) return;
    const category = this.categories[this.currentIndex];
    const categoryName = category.value || category.name || category.slug || '';
    if (!categoryName) {
      window.alert('Select a category to delete.');
      return;
    }
    const confirmDelete = window.confirm(
      `Delete category "${categoryName}" from config and remove it from all posters that use it?`
    );
    if (!confirmDelete) return;

    this.currentIndex = null;
    try {
      const result = await this.requestJson('/api/delete-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryName })
      }, 'Failed to delete category');
      await this.loadConfig();
      const removedCount = Number(result?.categoryRefsRemoved) || 0;
      window.alert(`Deleted category "${categoryName}". Removed from ${removedCount} poster reference(s).`);
    } catch (error) {
      console.error('Error deleting category:', error);
      window.alert(`Failed to delete category: ${error.message}`);
    }
  }

  openGenerator() {
    const payload = this.buildCategoryPayload();
    this.generatorCount.value = payload.targetCount || '';
    this.generatorTopics.value = payload.topics.join('\n');
    this.mergeCheckbox.checked = true;
    this.mergeOnlyCheckbox.checked = false;
    this.generatorLog.textContent = '';
    this.modal.classList.add('active');
  }

  closeGenerator() {
    this.modal.classList.remove('active');
  }

  async runGenerator() {
    const payload = this.buildCategoryPayload();
    if (!payload.name) {
      window.alert('Save the category name before running.');
      return;
    }

    const overrideTopics = this.parseTopics(this.generatorTopics.value);
    const topicsToUse = overrideTopics.length ? overrideTopics : payload.topics;
    if (!topicsToUse.length) {
      window.alert('Add at least one topic to run the generator.');
      return;
    }

    const count = this.generatorCount.value ? parseInt(this.generatorCount.value, 10) : null;

    this.generatorLog.textContent = `Running ${payload.source || 'wikipedia'} generator...\n`;
    try {
      const data = await this.requestJson('/api/run-grab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: payload.source || 'wikipedia',
          category: payload.name,
          topics: topicsToUse,
          count,
          mergeEnrich: this.mergeCheckbox.checked,
          mergeOnly: this.mergeOnlyCheckbox.checked
        })
      }, 'Failed to run generator');
      this.generatorLog.textContent = data.output || 'No output returned.';
    } catch (error) {
      this.generatorLog.textContent = `Error: ${error.message}`;
    }
  }

  async loadLog(endpoint) {
    try {
      const data = await this.requestJson(endpoint, {}, 'Failed to load log');
      this.generatorLog.textContent = data.log || 'No log available.';
    } catch (error) {
      this.generatorLog.textContent = `Error: ${error.message}`;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new CategoryEditor();
});
