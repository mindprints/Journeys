/**
 * unified-editor.js
 * JavaScript for the Unified Poster Editor supporting v2 poster format
 */

class UnifiedEditor {
    constructor() {
        this.currentPoster = null;
        this.isDirty = false;
        this.categories = [];
        this.posters = [];
        this.images = [];
        this.additionalImages = [];
        this.imagePickerTarget = 'primary';
        this.maxImages = 5;
        this.postersDirectory = 'JSON_Posters/Posters';
        this.categoryValues = [];

        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.loadCategories();
        await this.loadPosters();
        await this.loadImages();
        this.updatePreview();
    }

    cacheElements() {
        // Sidebar
        this.posterList = document.getElementById('poster-list');
        this.searchInput = document.getElementById('poster-search');
        this.categoryFilter = document.getElementById('category-filter');

        // Tabs
        this.tabs = document.querySelectorAll('.editor-tab');
        this.tabContents = document.querySelectorAll('.tab-content');

        // Front side form
        this.frontTitle = document.getElementById('front-title');
        this.frontSubtitle = document.getElementById('front-subtitle');
        this.epochStart = document.getElementById('epoch-start');
        this.epochEnd = document.getElementById('epoch-end');
        this.eventsContainer = document.getElementById('events-container');

        // Back side form
        this.backLayout = document.getElementById('back-layout');
        this.backText = document.getElementById('back-text');
        this.imagePicker = document.getElementById('image-picker');
        this.backImageSrc = document.getElementById('back-image-src');
        this.backImageAlt = document.getElementById('back-image-alt');
        this.imageOptions = document.getElementById('image-options');
        this.imagePosition = document.getElementById('image-position');
        this.imageAltText = document.getElementById('image-alt-text');
        this.imageDimensions = document.getElementById('image-dimensions');
        this.imageMaxWidth = document.getElementById('image-max-width');
        this.imageMaxHeight = document.getElementById('image-max-height');
        this.imageFitGroup = document.getElementById('image-fit-group');
        this.imageFit = document.getElementById('image-fit');
        this.extraImagesList = document.getElementById('extra-images-list');
        this.addExtraImageBtn = document.getElementById('add-extra-image-btn');
        this.linksList = document.getElementById('links-list');

        // Meta
        this.posterFilename = document.getElementById('poster-filename');
        this.metaTags = document.getElementById('meta-tags');
        this.metaSource = document.getElementById('meta-source');
        this.metaCategories = document.getElementById('meta-categories');
        this.categorySuggestions = document.getElementById('category-suggestions');
        this.categoryChips = document.getElementById('meta-categories-chips');
        this.displayUid = document.getElementById('display-uid');
        this.displayCreated = document.getElementById('display-created');
        this.displayModified = document.getElementById('display-modified');

        // Hidden fields
        this.posterUid = document.getElementById('poster-uid');
        this.posterPath = document.getElementById('poster-path');

        // Preview
        this.previewPoster = document.getElementById('preview-poster');
        this.previewTitle = document.getElementById('preview-title');
        this.previewSubtitle = document.getElementById('preview-subtitle');
        this.previewChronology = document.getElementById('preview-chronology');
        this.previewBackContent = document.getElementById('preview-back-content');

        // Modals
        this.imagePickerModal = document.getElementById('image-picker-modal');
        this.confirmModal = document.getElementById('confirm-modal');
        this.newPosterModal = document.getElementById('new-poster-modal');
        this.imageGallery = document.getElementById('image-gallery');
    }

    bindEvents() {
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Search and filter
        this.searchInput.addEventListener('input', () => this.filterPosters());
        this.categoryFilter.addEventListener('change', () => this.filterPosters());

        // Form inputs - update preview on change
        const formInputs = [
            this.frontTitle, this.frontSubtitle, this.epochStart, this.epochEnd,
            this.backLayout, this.backText, this.imagePosition, this.imageAltText
        ];
        formInputs.forEach(input => {
            if (input) {
                input.addEventListener('input', () => this.updatePreview());
                input.addEventListener('change', () => {
                    this.updatePreview();
                    this.markDirty();
                });
            }
        });

        // Buttons
        document.getElementById('new-poster-btn').addEventListener('click', () => this.createNewPoster());
        document.getElementById('add-event-btn').addEventListener('click', () => this.addEvent());
        document.getElementById('add-link-btn').addEventListener('click', () => this.addLink());
        document.getElementById('save-btn').addEventListener('click', () => this.savePoster());
        document.getElementById('delete-btn').addEventListener('click', () => this.confirmDelete());
        document.getElementById('cancel-btn').addEventListener('click', () => this.cancelEdit());
        document.getElementById('refresh-list-btn').addEventListener('click', () => this.loadPosters());

        // Preview flip
        document.getElementById('toggle-preview-btn').addEventListener('click', () => this.togglePreview());
        document.getElementById('preview-front-btn').addEventListener('click', () => this.showPreviewSide('front'));
        document.getElementById('preview-back-btn').addEventListener('click', () => this.showPreviewSide('back'));

        // Image picker
        this.imagePicker.addEventListener('click', () => this.showImagePicker('primary'));
        document.getElementById('close-image-modal').addEventListener('click', () => this.hideImagePicker());
        document.getElementById('cancel-image-btn').addEventListener('click', () => this.hideImagePicker());
        document.getElementById('select-image-btn').addEventListener('click', () => this.selectImage());
        document.getElementById('use-url-btn').addEventListener('click', () => this.useImageUrl());
        if (this.addExtraImageBtn) {
            this.addExtraImageBtn.addEventListener('click', () => this.showImagePicker('additional'));
        }

        if (this.metaCategories) {
            this.metaCategories.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    this.commitCategoryInput();
                }
            });
            this.metaCategories.addEventListener('blur', () => this.commitCategoryInput());
        }

        // Confirm modal
        document.getElementById('confirm-cancel').addEventListener('click', () => this.hideConfirmModal());
    }

    // === API Methods ===

    async loadCategories() {
        try {
            const response = await fetch('/api/categories');
            if (!response.ok) throw new Error('Failed to load categories');
            const categories = await response.json();

            this.categories = categories.map(c => ({
                value: c.value || c.name,
                label: c.name || c.value
            }));

            this.categoryFilter.innerHTML = '<option value="">All Categories</option>';
            this.categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.value;
                option.textContent = cat.label;
                this.categoryFilter.appendChild(option);
            });

            if (this.categorySuggestions) {
                this.categorySuggestions.innerHTML = '';
                this.categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.value;
                    this.categorySuggestions.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    async loadPosters() {
        try {
            const response = await fetch('/api/posters-all');
            if (!response.ok) throw new Error('Failed to load posters');
            this.posters = await response.json();
            this.renderPosterList();
        } catch (error) {
            console.error('Error loading posters:', error);
        }
    }

    async loadImages() {
        try {
            const response = await fetch('/api/images');
            if (!response.ok) throw new Error('Failed to load images');
            this.images = await response.json();
        } catch (error) {
            console.error('Error loading images:', error);
            this.images = [];
        }
    }

    async savePoster() {
        if (!this.frontTitle.value.trim()) {
            alert('Please enter a title');
            return;
        }

        this.commitCategoryInput();

        const posterData = this.buildPosterData();
        const isNew = !this.posterPath.value;

        try {
            const ingestResult = await this.ingestExternalImages(posterData);
            if (ingestResult.errors.length) {
                alert(`Some external images could not be ingested and will remain linked:\n- ${ingestResult.errors.join('\n- ')}`);
            }

            const category = this.postersDirectory;
            let filename = this.posterFilename.value.trim();

            if (!filename) {
                filename = this.frontTitle.value
                    .replace(/[^a-zA-Z0-9\s]/g, '')
                    .replace(/\s+/g, '_')
                    .substring(0, 50);
            }

            if (!filename.endsWith('.json')) {
                filename += '.json';
            }

            const savePath = isNew ? `${category}/${filename}` : this.posterPath.value;

            const response = await fetch('/api/save-poster', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: savePath,
                    data: posterData
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save poster');
            }

            this.isDirty = false;
            this.posterPath.value = savePath;

            await this.loadImages();
            await this.loadPosters();

            // Select the saved poster
            const savedItem = this.posterList.querySelector(`[data-path="${savePath}"]`);
            if (savedItem) {
                savedItem.classList.add('selected');
            }

            console.log('Poster saved successfully');
        } catch (error) {
            console.error('Error saving poster:', error);
            alert(`Failed to save poster: ${error.message}`);
        }
    }

    async deletePoster() {
        const path = this.posterPath.value;
        if (!path) return;

        try {
            const response = await fetch(`/api/delete-poster?path=${encodeURIComponent(path)}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete poster');

            this.clearForm();
            await this.loadPosters();
        } catch (error) {
            console.error('Error deleting poster:', error);
            alert(`Failed to delete poster: ${error.message}`);
        }
    }

    // === UI Methods ===

    renderPosterList() {
        const filtered = this.getFilteredPosters();

        this.posterList.innerHTML = filtered.map(poster => {
            const icon = this.getPosterIcon(poster);
            const title = poster.front?.title || poster.data?.figure || poster.title || poster.filename;
            const categories = Array.isArray(poster.meta?.categories)
                ? poster.meta.categories
                : Array.isArray(poster.categories)
                    ? poster.categories
                    : [];
            const categoryLabel = categories.length ? categories.join(', ') : 'Uncategorized';

            return `
        <div class="poster-list-item" data-path="${poster.path}" onclick="editor.selectPoster('${poster.path}')">
          <div class="icon ${icon.class}"><i class="fas ${icon.icon}"></i></div>
          <div class="info">
            <div class="title">${this.escapeHtml(title)}</div>
            <div class="meta">${this.escapeHtml(categoryLabel)}</div>
          </div>
        </div>
      `;
        }).join('');
    }

    getFilteredPosters() {
        const search = this.searchInput.value.toLowerCase();
        const category = this.categoryFilter.value;

        return this.posters.filter(poster => {
            const title = (poster.front?.title || poster.data?.figure || poster.title || poster.filename || '').toLowerCase();
            const matchesSearch = !search || title.includes(search);
            const categories = Array.isArray(poster.meta?.categories)
                ? poster.meta.categories
                : Array.isArray(poster.categories)
                    ? poster.categories
                    : [];
            const matchesCategory = !category || categories.some(c => String(c).toLowerCase() === category.toLowerCase());
            return matchesSearch && matchesCategory;
        });
    }

    filterPosters() {
        this.renderPosterList();
    }

    getPosterIcon(poster) {
        const type = poster.type || 'json';
        if (type === 'poster-v2' || poster.version === 2) {
            const hasImage = poster.back?.image?.src || (Array.isArray(poster.back?.images) && poster.back.images.length > 0);
            const hasUrl = poster.back?.links?.some(l => l.type === 'external' && l.primary);
            if (hasUrl) return { icon: 'fa-globe', class: 'website' };
            if (hasImage) return { icon: 'fa-image', class: 'image' };
            return { icon: 'fa-align-left', class: 'text' };
        }
        if (type === 'website') return { icon: 'fa-globe', class: 'website' };
        if (type === 'image') return { icon: 'fa-image', class: 'image' };
        return { icon: 'fa-align-left', class: 'text' };
    }

    selectPoster(path) {
        if (this.isDirty && !confirm('You have unsaved changes. Discard them?')) {
            return;
        }

        // Find poster
        const poster = this.posters.find(p => p.path === path);
        if (!poster) return;

        // Update selection UI
        document.querySelectorAll('.poster-list-item').forEach(el => el.classList.remove('selected'));
        document.querySelector(`[data-path="${path}"]`)?.classList.add('selected');

        // Load into form
        this.loadPosterIntoForm(poster);
        this.currentPoster = poster;
        this.isDirty = false;

        // Enable delete button
        document.getElementById('delete-btn').disabled = false;
    }

    loadPosterIntoForm(poster) {
        // Handle v2 format
        if (poster.type === 'poster-v2' || poster.version === 2) {
            this.loadV2Poster(poster);
        } else {
            this.loadLegacyPoster(poster);
        }

        this.updatePreview();
    }

    loadV2Poster(poster) {
        const front = poster.front || {};
        const back = poster.back || {};
        const meta = poster.meta || {};

        // Front
        this.frontTitle.value = front.title || '';
        this.frontSubtitle.value = front.subtitle || '';

        if (front.chronology) {
            this.epochStart.value = front.chronology.epochStart || '';
            this.epochEnd.value = front.chronology.epochEnd || '';
            this.loadEvents(front.chronology.epochEvents || []);
        } else {
            this.epochStart.value = '';
            this.epochEnd.value = '';
            this.eventsContainer.innerHTML = '';
        }

        // Back
        this.backLayout.value = back.layout || 'auto';
        this.backText.value = back.text || '';

        const imageList = Array.isArray(back.images)
            ? back.images.filter(img => img && img.src)
            : [];
        let primaryImage = null;
        let additionalImages = [];

        if (back.image?.src) {
            primaryImage = back.image;
            additionalImages = imageList.filter(img => img.src !== back.image.src);
        } else if (imageList.length) {
            primaryImage = imageList[0];
            additionalImages = imageList.slice(1);
        }

        if (primaryImage) {
            this.setImage(primaryImage.src, primaryImage.alt || '');
            this.imagePosition.value = back.image?.position || 'top';
            // Load image dimensions
            if (this.imageMaxWidth) this.imageMaxWidth.value = back.image?.maxWidth || '';
            if (this.imageMaxHeight) this.imageMaxHeight.value = back.image?.maxHeight || '';
            if (this.imageFit) this.imageFit.value = back.image?.fit || 'contain';
        } else {
            this.clearImage();
        }

        const maxAdditional = this.maxImages - (primaryImage ? 1 : 0);
        const limitedAdditional = additionalImages.slice(0, Math.max(0, maxAdditional));
        this.setAdditionalImages(limitedAdditional.map(img => ({
            src: img.src,
            alt: img.alt || ''
        })));

        this.loadLinks(back.links || []);

        // Meta
        this.metaTags.value = (meta.tags || []).join(', ');
        this.metaSource.value = meta.source || '';
        this.setCategories(meta.categories || []);
        this.displayUid.value = poster.uid || '';
        this.displayCreated.value = meta.created || '';
        this.displayModified.value = meta.modified || '';

        // Hidden
        this.posterUid.value = poster.uid || '';
        this.posterPath.value = poster.path || '';
        this.posterFilename.value = poster.filename?.replace('.json', '') || '';

    }

    loadLegacyPoster(poster) {
        const data = poster.data || poster;

        // Front
        this.frontTitle.value = data.figure || data.title || poster.title || '';
        this.frontSubtitle.value = '';

        if (data.chronology) {
            this.epochStart.value = data.chronology.epochStart || '';
            this.epochEnd.value = data.chronology.epochEnd || '';
            this.loadEvents(data.chronology.epochEvents || []);
        } else {
            this.epochStart.value = '';
            this.epochEnd.value = '';
            this.eventsContainer.innerHTML = '';
        }

        // Back
        this.backLayout.value = 'auto';
        this.backText.value = data.header || data.description || '';

        if (data.imagePath) {
            this.setImage(data.imagePath, data.alt || '');
        } else if (data.url) {
            // Website poster - add as link
            this.loadLinks([{
                type: 'external',
                url: data.url,
                label: 'Visit Website',
                primary: true
            }]);
        } else {
            this.clearImage();
        }

        this.setAdditionalImages([]);

        // Hidden
        this.posterPath.value = poster.path || '';
        this.posterFilename.value = poster.filename?.replace('.json', '') || '';
        this.setCategories([]);
    }

    buildPosterData() {
        const now = new Date().toISOString();
        const uid = this.posterUid.value || this.generateUid();

        const poster = {
            version: 2,
            type: 'poster-v2',
            uid: uid,
            front: {
                title: this.frontTitle.value.trim()
            },
            back: {
                layout: this.backLayout.value
            },
            meta: {
                created: this.displayCreated.value || now,
                modified: now
            }
        };

        // Subtitle
        if (this.frontSubtitle.value.trim()) {
            poster.front.subtitle = this.frontSubtitle.value.trim();
        }

        // Chronology
        const epochStart = parseInt(this.epochStart.value);
        const epochEnd = parseInt(this.epochEnd.value);
        const events = this.collectEvents();

        if (!isNaN(epochStart) || !isNaN(epochEnd) || events.length > 0) {
            poster.front.chronology = {};
            if (!isNaN(epochStart)) poster.front.chronology.epochStart = epochStart;
            if (!isNaN(epochEnd)) poster.front.chronology.epochEnd = epochEnd;
            if (events.length > 0) poster.front.chronology.epochEvents = events;
        }

        // Back text
        if (this.backText.value.trim()) {
            poster.back.text = this.backText.value.trim();
        }

        // Back image
        const maxAdditional = this.backImageSrc.value ? this.maxImages - 1 : this.maxImages;
        const normalizedAdditional = this.additionalImages
            .filter(img => img && img.src)
            .map(img => ({ src: img.src, alt: img.alt || '' }))
            .slice(0, Math.max(0, maxAdditional));
        let imageList = [];

        if (this.backImageSrc.value) {
            poster.back.image = {
                src: this.backImageSrc.value,
                alt: this.imageAltText.value || '',
                position: this.imagePosition.value || 'top'
            };
            // Add dimension properties if set
            const maxWidth = parseInt(this.imageMaxWidth?.value);
            const maxHeight = parseInt(this.imageMaxHeight?.value);
            if (!isNaN(maxWidth)) poster.back.image.maxWidth = maxWidth;
            if (!isNaN(maxHeight)) poster.back.image.maxHeight = maxHeight;
            if (this.imageFit?.value && this.imageFit.value !== 'contain') {
                poster.back.image.fit = this.imageFit.value;
            }
            imageList = [{ src: poster.back.image.src, alt: poster.back.image.alt }, ...normalizedAdditional];
        } else if (normalizedAdditional.length > 0) {
            const primaryFallback = normalizedAdditional[0];
            poster.back.image = {
                src: primaryFallback.src,
                alt: primaryFallback.alt || '',
                position: this.imagePosition.value || 'top'
            };
            imageList = [primaryFallback, ...normalizedAdditional.slice(1)];
        }

        if (imageList.length > 1) {
            poster.back.images = imageList.slice(0, this.maxImages);
        }

        // Links
        const links = this.collectLinks();
        if (links.length > 0) {
            poster.back.links = links;
        }

        // Meta
        const tags = this.metaTags.value.split(',').map(t => t.trim()).filter(t => t);
        if (tags.length > 0) {
            poster.meta.tags = tags;
        }
        if (this.metaSource.value.trim()) {
            poster.meta.source = this.metaSource.value.trim();
        }

        const categories = this.getCategories();
        poster.meta.categories = categories.length ? categories : ['Uncategorized'];

        return poster;
    }

    // === Event Handling ===

    loadEvents(events) {
        this.eventsContainer.innerHTML = '';
        events.forEach(event => this.addEvent(event.year, event.name));
    }

    addEvent(year = '', name = '') {
        const div = document.createElement('div');
        div.className = 'event-input-group';
        div.innerHTML = `
      <input type="number" placeholder="Year" value="${year}" class="event-year">
      <input type="text" placeholder="Event name" value="${this.escapeHtml(name)}" class="event-name">
      <button type="button" class="remove-event-btn" onclick="this.parentElement.remove(); editor.updatePreview();">
        <i class="fas fa-times"></i>
      </button>
    `;
        this.eventsContainer.appendChild(div);

        // Bind change events
        div.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.updatePreview());
        });
    }

    collectEvents() {
        const events = [];
        this.eventsContainer.querySelectorAll('.event-input-group').forEach(group => {
            const year = parseInt(group.querySelector('.event-year').value);
            const name = group.querySelector('.event-name').value.trim();
            if (!isNaN(year) && name) {
                events.push({ year, name });
            }
        });
        return events;
    }

    // === Link Handling ===

    loadLinks(links) {
        this.linksList.innerHTML = '';
        links.forEach(link => this.addLink(link));
    }

    addLink(link = { type: 'external', url: '', label: '' }) {
        const div = document.createElement('div');
        div.className = 'link-item';
        div.innerHTML = `
      <select class="link-type">
        <option value="external" ${link.type === 'external' ? 'selected' : ''}>External</option>
        <option value="internal" ${link.type === 'internal' ? 'selected' : ''}>Internal</option>
        <option value="file" ${link.type === 'file' ? 'selected' : ''}>File</option>
      </select>
      <input type="text" placeholder="URL or path" value="${this.escapeHtml(link.url || link.target || link.path || '')}" class="link-url">
      <input type="text" placeholder="Label" value="${this.escapeHtml(link.label || '')}" class="link-label">
      <div class="link-actions">
        <label style="display: flex; align-items: center; gap: 0.25em; font-size: 0.8em;">
          <input type="checkbox" class="link-primary" ${link.primary ? 'checked' : ''}> Primary
        </label>
        <button type="button" class="editor-btn small danger" onclick="this.closest('.link-item').remove();">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
        this.linksList.appendChild(div);
    }

    collectLinks() {
        const links = [];
        this.linksList.querySelectorAll('.link-item').forEach(item => {
            const type = item.querySelector('.link-type').value;
            const url = item.querySelector('.link-url').value.trim();
            const label = item.querySelector('.link-label').value.trim();
            const primary = item.querySelector('.link-primary').checked;

            if (url && label) {
                const link = { type, label };
                if (type === 'external') link.url = url;
                else if (type === 'internal') link.target = url;
                else if (type === 'file') link.path = url;
                if (primary) link.primary = true;
                links.push(link);
            }
        });
        return links;
    }

    // === Image Handling ===

    showImagePicker(target = 'primary') {
        this.imagePickerTarget = target;
        this.renderImageGallery();
        this.imagePickerModal.classList.add('active');
    }

    hideImagePicker() {
        this.imagePickerModal.classList.remove('active');
    }

    renderImageGallery() {
        this.imageGallery.innerHTML = this.images.map(img => `
      <div class="image-gallery-item" data-src="${img.path}" onclick="editor.toggleImageSelection(this)">
        <img src="${img.path}" alt="${img.name || ''}">
      </div>
    `).join('');
    }

    toggleImageSelection(element) {
        document.querySelectorAll('.image-gallery-item').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
    }

    selectImage() {
        const selected = this.imageGallery.querySelector('.image-gallery-item.selected');
        if (selected) {
            const src = selected.dataset.src;
            if (this.imagePickerTarget === 'additional') {
                this.addAdditionalImage(src);
            } else {
                this.setImage(src);
            }
            this.hideImagePicker();
        }
    }

    async ingestExternalImages(posterData) {
        const result = { updated: false, errors: [] };
        const imageTargets = [];

        if (posterData?.back?.image?.src) {
            imageTargets.push(posterData.back.image);
        }
        if (Array.isArray(posterData?.back?.images)) {
            posterData.back.images.forEach(img => {
                if (img && img.src) imageTargets.push(img);
            });
        }

        if (!imageTargets.length) return result;

        const externalMap = new Map();
        for (const target of imageTargets) {
            const src = target?.src || '';
            if (!src || !this.isExternalUrl(src)) continue;
            if (externalMap.has(src)) continue;
            try {
                const localPath = await this.downloadToWebp(src, posterData.front?.title || 'poster');
                externalMap.set(src, localPath);
            } catch (error) {
                result.errors.push(`${src} (${error.message})`);
            }
        }

        if (externalMap.size === 0) return result;

        imageTargets.forEach(target => {
            const replacement = externalMap.get(target.src);
            if (replacement) {
                target.src = replacement;
                result.updated = true;
            }
        });

        if (result.updated && Array.isArray(posterData?.back?.images)) {
            posterData.back.images = posterData.back.images.filter(img => img && img.src);
        }

        return result;
    }

    isExternalUrl(value) {
        return /^https?:\/\//i.test(value || '');
    }

    sanitizeFilename(value) {
        return (value || 'image')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '')
            .substring(0, 40) || 'image';
    }

    async downloadToWebp(url, titleBase) {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`Download failed (${response.status})`);
        }

        const blob = await response.blob();
        const image = await this.loadImageFromBlob(blob);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const webpBlob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/webp', 0.92);
        });

        if (!webpBlob) {
            throw new Error('WebP conversion failed');
        }

        const filenameBase = this.sanitizeFilename(titleBase);
        const uniqueSuffix = Date.now().toString(36);
        const filename = `${filenameBase}_${uniqueSuffix}.webp`;
        const savePath = `images/originals/${filename}`;

        const formData = new FormData();
        formData.append('image', webpBlob, filename);
        formData.append('path', savePath);

        const saveResponse = await fetch('/api/save-image', {
            method: 'POST',
            body: formData
        });

        if (!saveResponse.ok) {
            const error = await saveResponse.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to save image');
        }

        return savePath;
    }

    loadImageFromBlob(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(blob);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Image decode failed'));
            };
            img.src = objectUrl;
        });
    }

    useImageUrl() {
        const url = document.getElementById('image-url-input').value.trim();
        if (url) {
            if (this.imagePickerTarget === 'additional') {
                this.addAdditionalImage(url);
            } else {
                this.setImage(url);
            }
            this.hideImagePicker();
        }
    }

    setImage(src, alt = '') {
        this.backImageSrc.value = src;
        this.backImageAlt.value = alt;
        this.imageAltText.value = alt;

        this.imagePicker.innerHTML = `<img src="${src}" alt="${alt}">`;
        this.imagePicker.classList.add('has-image');
        this.imageOptions.style.display = 'grid';
        if (this.imageDimensions) this.imageDimensions.style.display = 'grid';
        if (this.imageFitGroup) this.imageFitGroup.style.display = 'block';

        const maxAdditional = this.maxImages - 1;
        if (this.additionalImages.length > maxAdditional) {
            this.additionalImages = this.additionalImages.slice(0, maxAdditional);
            this.renderAdditionalImages();
        }

        this.updatePreview();
    }

    clearImage() {
        this.backImageSrc.value = '';
        this.backImageAlt.value = '';
        this.imageAltText.value = '';
        if (this.imageMaxWidth) this.imageMaxWidth.value = '';
        if (this.imageMaxHeight) this.imageMaxHeight.value = '';
        if (this.imageFit) this.imageFit.value = 'contain';

        this.imagePicker.innerHTML = `
      <i class="fas fa-plus-circle"></i>
      <span>Click to select image</span>
    `;
        this.imagePicker.classList.remove('has-image');
        this.imageOptions.style.display = 'none';
        if (this.imageDimensions) this.imageDimensions.style.display = 'none';
        if (this.imageFitGroup) this.imageFitGroup.style.display = 'none';
    }

    setAdditionalImages(images) {
        const maxAdditional = this.backImageSrc.value ? this.maxImages - 1 : this.maxImages;
        this.additionalImages = Array.isArray(images) ? images.slice(0, Math.max(0, maxAdditional)) : [];
        this.renderAdditionalImages();
    }

    renderAdditionalImages() {
        if (!this.extraImagesList) return;
        if (!this.additionalImages.length) {
            this.extraImagesList.innerHTML = '<div class="muted">No additional images yet.</div>';
            return;
        }
        this.extraImagesList.innerHTML = this.additionalImages.map((img, index) => `
      <div class="additional-image-item" data-index="${index}">
        <div class="additional-image-thumb">
          <img src="${img.src}" alt="${this.escapeHtml(img.alt || '')}">
        </div>
        <div class="additional-image-fields">
          <input type="text" class="additional-image-alt" placeholder="Alt text" value="${this.escapeHtml(img.alt || '')}">
          <small>${this.escapeHtml(img.src)}</small>
        </div>
        <button type="button" class="editor-btn small danger remove-additional-image" data-index="${index}">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');

        this.extraImagesList.querySelectorAll('.remove-additional-image').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const idx = Number.parseInt(event.currentTarget.dataset.index, 10);
                this.removeAdditionalImage(idx);
            });
        });

        this.extraImagesList.querySelectorAll('.additional-image-alt').forEach((input, index) => {
            input.addEventListener('input', (event) => {
                this.updateAdditionalImageAlt(index, event.target.value);
            });
        });
    }

    addAdditionalImage(src, alt = '') {
        if (!src) return;
        const maxAdditional = this.backImageSrc.value ? this.maxImages - 1 : this.maxImages;
        if (this.additionalImages.length >= maxAdditional) {
            alert(`You can add up to ${this.maxImages} total images.`);
            return;
        }
        this.additionalImages.push({ src, alt });
        this.renderAdditionalImages();
        this.updatePreview();
        this.markDirty();
    }

    removeAdditionalImage(index) {
        if (index < 0 || index >= this.additionalImages.length) return;
        this.additionalImages.splice(index, 1);
        this.renderAdditionalImages();
        this.updatePreview();
        this.markDirty();
    }

    updateAdditionalImageAlt(index, value) {
        if (!this.additionalImages[index]) return;
        this.additionalImages[index].alt = value;
        this.updatePreview();
        this.markDirty();
    }

    // === Preview ===

    updatePreview() {
        // Front side
        this.previewTitle.textContent = this.frontTitle.value || 'Poster Title';
        this.previewSubtitle.textContent = this.frontSubtitle.value || '';

        // Chronology
        let chronologyHtml = '';
        const epochStart = parseInt(this.epochStart.value);
        const epochEnd = parseInt(this.epochEnd.value);

        if (!isNaN(epochStart) && !isNaN(epochEnd)) {
            chronologyHtml += `<div class="timeline-dates"><span class="timeline-span">${epochStart} — ${epochEnd}</span></div>`;
        } else if (!isNaN(epochStart)) {
            chronologyHtml += `<div class="timeline-dates"><span class="timeline-start">${epochStart}</span></div>`;
        } else if (!isNaN(epochEnd)) {
            chronologyHtml += `<div class="timeline-dates"><span class="timeline-end">${epochEnd}</span></div>`;
        }

        const events = this.collectEvents();
        if (events.length > 0) {
            chronologyHtml += '<div class="timeline-events">';
            events.forEach(event => {
                chronologyHtml += `<div class="event"><span class="year">${event.year}</span>: ${this.escapeHtml(event.name)}</div>`;
            });
            chronologyHtml += '</div>';
        }

        this.previewChronology.innerHTML = chronologyHtml;

        // Back side
        let formattedText = '';
        if (this.backText.value) {
            if (typeof snarkdown === 'function') {
                formattedText = snarkdown(this.backText.value);
            } else {
                formattedText = this.backText.value
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/\n/g, '<br>');
                formattedText = `<p>${formattedText}</p>`;
            }
        }

        const links = this.collectLinks();
        let linksHtml = '';
        if (links.length > 0) {
            linksHtml += '<div class="v2-back-links"><div class="v2-back-panel-title">Links</div>';
            links.forEach(link => {
                const isPrimary = link.primary ? ' primary' : '';
                const icon = link.type === 'external' ? 'fa-external-link-alt'
                    : link.type === 'internal' ? 'fa-link' : 'fa-file';
                linksHtml += `<a class="v2-link${isPrimary}"><i class="fas ${icon}"></i> ${this.escapeHtml(link.label)}</a>`;
            });
            linksHtml += '</div>';
        }

        const categoryLabels = this.getCategories();
        const badgesHtml = categoryLabels.length
            ? `<div class="v2-back-badges">${categoryLabels.map(label => `<span class="v2-back-badge">${this.escapeHtml(label)}</span>`).join('')}</div>`
            : '';

        const additionalImages = this.additionalImages.filter(img => img && img.src);
        let imageList = [];
        if (this.backImageSrc.value) {
            imageList = [{
                src: this.backImageSrc.value,
                alt: this.imageAltText.value || ''
            }, ...additionalImages];
        } else if (additionalImages.length > 0) {
            imageList = additionalImages;
        }
        imageList = imageList.slice(0, this.maxImages);
        const hasImage = imageList.length > 0;
        const gridClass = hasImage ? 'v2-back-grid' : 'v2-back-grid v2-back-grid--single';
        const extraImageDots = Math.max(0, imageList.length - 1);
        const dotsHtml = `<div class="v2-back-dot-group"><span class="v2-back-dot v2-back-dot--accent"></span>${
            extraImageDots ? '<span class="v2-back-dot"></span>'.repeat(extraImageDots) : ''
        }</div>`;

        let backHtml = `<div class="poster-v2-header" data-layout="${this.backLayout.value || 'auto'}"><div class="v2-back-frame"><div class="v2-back-content">`;
        backHtml += `<div class="v2-back-header">
          <div class="v2-back-title">${this.escapeHtml(this.frontTitle.value || 'Poster Title')}</div>
          ${this.frontSubtitle.value ? `<div class="v2-back-subtitle"><span>Subtitle:</span> ${this.escapeHtml(this.frontSubtitle.value)}</div>` : ''}
          ${badgesHtml}
        </div>`;
        backHtml += `<div class="${gridClass}">`;
        backHtml += `<div class="v2-back-panel v2-back-text-panel">
          <div class="v2-back-panel-title">Textbox</div>
          <div class="v2-back-text">${formattedText || '<p>Back side content will appear here.</p>'}</div>
          ${linksHtml}
        </div>`;

        if (hasImage) {
            const firstImage = imageList[0];
            backHtml += `<div class="v2-back-panel v2-back-image-panel" data-image-count="${imageList.length}">
              <div class="v2-back-panel-title">Image</div>
              <div class="v2-back-image"><img src="${firstImage.src}" alt="${this.escapeHtml(firstImage.alt || '')}"></div>
            </div>`;
        }

        backHtml += `</div>${dotsHtml}</div></div></div>`;
        this.previewBackContent.innerHTML = backHtml;
    }

    togglePreview() {
        this.previewPoster.classList.toggle('flipped');
    }

    showPreviewSide(side) {
        if (side === 'front') {
            this.previewPoster.classList.remove('flipped');
        } else {
            this.previewPoster.classList.add('flipped');
        }
    }

    // === Tab Switching ===

    switchTab(tabId) {
        this.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });
    }

    // === New Poster ===

    createNewPoster() {
        this.clearForm();
        this.switchTab('front');
        this.frontTitle.focus();
        document.getElementById('delete-btn').disabled = true;
    }

    // === Delete ===

    confirmDelete() {
        if (!this.posterPath.value) return;

        document.getElementById('confirm-title').textContent = 'Delete Poster';
        document.getElementById('confirm-message').textContent =
            `Are you sure you want to delete "${this.frontTitle.value}"? This action cannot be undone.`;

        document.getElementById('confirm-ok').onclick = () => {
            this.hideConfirmModal();
            this.deletePoster();
        };

        this.confirmModal.classList.add('active');
    }

    hideConfirmModal() {
        this.confirmModal.classList.remove('active');
    }

    // === Utilities ===

    normalizeCategory(value) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/\s+/g, ' ')
            .replace(/\s*,\s*/g, ',')
            .trim();
    }

    setCategories(categories) {
        const incoming = Array.isArray(categories) ? categories : [];
        this.categoryValues = [];
        incoming.forEach(category => this.addCategory(category, false));
        this.renderCategoryChips();
        if (this.metaCategories) {
            this.metaCategories.value = '';
        }
    }

    getCategories() {
        return Array.isArray(this.categoryValues) ? this.categoryValues.slice() : [];
    }

    commitCategoryInput() {
        if (!this.metaCategories) return;
        const raw = this.metaCategories.value;
        if (!raw.trim()) return;
        raw.split(',').forEach(value => this.addCategory(value));
        this.metaCategories.value = '';
        this.renderCategoryChips();
        this.updatePreview();
        this.markDirty();
    }

    addCategory(value, render = true) {
        const normalized = this.normalizeCategory(value);
        if (!normalized) return;
        if (!Array.isArray(this.categoryValues)) this.categoryValues = [];
        const exists = this.categoryValues.some(item => item.toLowerCase() === normalized.toLowerCase());
        if (!exists) {
            this.categoryValues.push(normalized);
            if (render) {
                this.renderCategoryChips();
                this.updatePreview();
                this.markDirty();
            }
        }
    }

    removeCategory(value) {
        if (!Array.isArray(this.categoryValues)) return;
        const normalized = this.normalizeCategory(value);
        this.categoryValues = this.categoryValues.filter(item => item.toLowerCase() !== normalized.toLowerCase());
        this.renderCategoryChips();
        this.updatePreview();
        this.markDirty();
    }

    renderCategoryChips() {
        if (!this.categoryChips) return;
        const categories = this.getCategories();
        if (!categories.length) {
            this.categoryChips.innerHTML = '';
            return;
        }

        this.categoryChips.innerHTML = categories.map(category => `
      <span class="category-chip">
        ${this.escapeHtml(category)}
        <button type="button" data-category="${this.escapeHtml(category)}">&times;</button>
      </span>
    `).join('');

        this.categoryChips.querySelectorAll('button[data-category]').forEach(button => {
            button.addEventListener('click', () => {
                this.removeCategory(button.dataset.category);
            });
        });
    }

    clearForm() {
        this.currentPoster = null;
        this.isDirty = false;

        this.frontTitle.value = '';
        this.frontSubtitle.value = '';
        this.epochStart.value = '';
        this.epochEnd.value = '';
        this.eventsContainer.innerHTML = '';

        this.backLayout.value = 'auto';
        this.backText.value = '';
        this.clearImage();
        this.setAdditionalImages([]);
        this.linksList.innerHTML = '';

        this.metaTags.value = '';
        this.metaSource.value = '';
        this.setCategories([]);
        this.displayUid.value = '';
        this.displayCreated.value = '';
        this.displayModified.value = '';

        this.posterUid.value = '';
        this.posterPath.value = '';
        this.posterFilename.value = '';

        document.querySelectorAll('.poster-list-item').forEach(el => el.classList.remove('selected'));

        this.updatePreview();
    }

    cancelEdit() {
        if (this.isDirty && !confirm('You have unsaved changes. Discard them?')) {
            return;
        }
        this.clearForm();
        document.getElementById('delete-btn').disabled = true;
    }

    markDirty() {
        this.isDirty = true;
    }

    generateUid() {
        return 'poster-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}

// Initialize editor
let editor;
document.addEventListener('DOMContentLoaded', () => {
    editor = new UnifiedEditor();
});
