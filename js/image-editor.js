// image-editor.js - Functionality for the image editor

// DOM Elements
const categoryChooser = document.getElementById('category-chooser');
const imagesList = document.getElementById('images-list');
const refreshBtn = document.getElementById('refresh-btn');
const confirmationDialog = document.getElementById('confirmation-dialog');
const dialogConfirmBtn = document.getElementById('dialog-confirm');
const dialogCancelBtn = document.getElementById('dialog-cancel');
const dialogMessage = document.getElementById('dialog-message');

const POSTERS_DIR = 'JSON_Posters/Posters';

// Image Upload and Processing Elements
const dropzone = document.getElementById('dropzone');
const pasteZone = document.getElementById('pasteZone');
const fileInput = document.getElementById('fileInput');
const imageUrl = document.getElementById('imageUrl');
const loadUrlBtn = document.getElementById('loadUrlBtn');
const imagePreviews = document.getElementById('imagePreviews');
const imageCount = document.getElementById('imageCount');
const processingOptions = document.getElementById('processingOptions');
const processAllBtn = document.getElementById('processAllBtn');
const cropSelectedBtn = document.getElementById('cropSelectedBtn');
const saveAllBtn = document.getElementById('saveAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const useJsonWrapper = document.getElementById('useJsonWrapper');
const imageMetadataPanel = document.getElementById('imageMetadataPanel');
const imageTitle = document.getElementById('imageTitle');
const imageDescription = document.getElementById('imageDescription');
const imageAltText = document.getElementById('imageAltText');
const imageFilename = document.getElementById('imageFilename');

// Crop Modal Elements
const cropModal = document.getElementById('cropModal');
const imageToCrop = document.getElementById('imageToCrop');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const applyCropBtn = document.getElementById('applyCropBtn');

// Global Variables
let currentCategory = '';
let existingImages = [];
let images = [];
let currentCropIndex = -1;
let cropper = null;
let dialogCallback = null;

// Initialize the editor
document.addEventListener('DOMContentLoaded', () => {
  console.log("Image Editor: DOM loaded, initializing...");

  // Check if directory chooser element exists
  if (!categoryChooser) {
    console.error("Image Editor: category-chooser element not found in the DOM!");
  alert("Error: Could not find category chooser element. Please contact support.");
    return;
  }

  populateCategoryChooser();
  initializeImageUploader();

  // Event listeners for directory and gallery functions
  categoryChooser.addEventListener('change', loadImagesFromCategory);
  refreshBtn.addEventListener('click', loadImagesFromCategory);

  // Dialog events
  dialogConfirmBtn.addEventListener('click', () => {
    if (dialogCallback) {
      dialogCallback();
    }
    closeDialog();
  });

  dialogCancelBtn.addEventListener('click', closeDialog);
});

// Initialize image uploader functionality
function initializeImageUploader() {
  // Drag and drop events
  dropzone.addEventListener('dragover', handleDragOver);
  dropzone.addEventListener('dragleave', handleDragLeave);
  dropzone.addEventListener('drop', handleDrop);
  fileInput.addEventListener('change', handleFileSelect);

  // Paste event
  pasteZone.addEventListener('click', handlePasteClick);
  document.addEventListener('paste', handlePaste);

  // URL loading
  loadUrlBtn.addEventListener('click', loadImageFromUrl);

  // AI image generation
  const aiGenerateImageBtn = document.getElementById('aiGenerateImageBtn');
  if (aiGenerateImageBtn) aiGenerateImageBtn.addEventListener('click', generateAiImageForEditor);

  // Button actions
  clearAllBtn.addEventListener('click', clearAllImages);
  processAllBtn.addEventListener('click', processAllImages);
  cropSelectedBtn.addEventListener('click', openCropModalForSelected);
  saveAllBtn.addEventListener('click', saveAllImagesToGallery);

  // Crop modal events
  cancelCropBtn.addEventListener('click', closeCropperModal);
  applyCropBtn.addEventListener('click', applyCrop);

  // JSON wrapper options
  useJsonWrapper.addEventListener('change', function () {
    console.log("JSON wrapper checkbox changed:", this.checked);
    if (this.checked) {
      imageMetadataPanel.style.display = 'block';
    } else {
      imageMetadataPanel.style.display = 'none';
    }
  });

  // Initialize metadata panel visibility based on checkbox
  imageMetadataPanel.style.display = useJsonWrapper.checked ? 'block' : 'none';
}

// Populate category chooser from poster metadata
async function populateCategoryChooser() {
  console.log("Image Editor: populateCategoryChooser function called");
  try {
    console.log("Image Editor: Fetching categories from /api/categories");
    const response = await fetch('/api/categories');
    if (!response.ok) {
      console.error("Image Editor: Failed to fetch categories", response.status, response.statusText);
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const categories = await response.json();
    console.log("Image Editor: Received categories:", categories);

    // Clear existing options
    categoryChooser.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Categories';
    categoryChooser.appendChild(allOption);

    categories.forEach(category => {
      const value = category.value || category.name;
      const label = category.name || category.value || value;
      if (!value) return;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      categoryChooser.appendChild(option);
    });

    if (categoryChooser.options.length > 0) {
      categoryChooser.selectedIndex = 0;
      console.log("Image Editor: Loading images for category:", categoryChooser.value);
      loadImagesFromCategory();
    } else {
      console.warn("Image Editor: No categories found to load");
    }
  } catch (error) {
    console.error('Error loading categories:', error);
    showErrorMessage('Failed to load categories. Please try again later.');
  }
}

// Load images from centralized location and show posters with images
async function loadImagesFromCategory() {
  console.log("Image Editor: loadImagesFromCategory called");
  currentCategory = categoryChooser.value;
  console.log("Image Editor: Current category set to:", currentCategory);
  existingImages = [];

  try {
    // Clear existing images list
    imagesList.innerHTML = '';

    // Load centralized images from /images/originals/
    console.log("Image Editor: Fetching centralized images");
    const imagesResponse = await fetch('/api/images');
    if (!imagesResponse.ok) {
      throw new Error(`Failed to fetch images: ${imagesResponse.status}`);
    }

    const allImages = await imagesResponse.json();
    console.log("Image Editor: Received images:", allImages.length);

    // Also load posters from the selected category that have images
    const postersResponse = currentCategory
      ? await fetch(`/api/posters-in-category?category=${encodeURIComponent(currentCategory)}`)
      : await fetch('/api/posters-all');
    if (!postersResponse.ok) {
      throw new Error(`Failed to fetch posters: ${postersResponse.status}`);
    }

    const posters = await postersResponse.json();
    const postersWithImages = posters.filter(p =>
      p.type === 'poster-v2' && p.back?.image?.src
    );
    console.log("Image Editor: v2 posters with images in category:", postersWithImages.length);

    // Add section header for centralized images
    const centralizedHeader = document.createElement('div');
    centralizedHeader.className = 'section-header';
    centralizedHeader.innerHTML = `<strong>📁 Centralized Images (${allImages.length})</strong>`;
    centralizedHeader.style.padding = '10px';
    centralizedHeader.style.borderBottom = '1px solid #444';
    centralizedHeader.style.marginBottom = '5px';
    imagesList.appendChild(centralizedHeader);

    // Show centralized images (limited to first 50 for performance)
    const displayImages = allImages.slice(0, 50);
    for (const img of displayImages) {
      existingImages.push({
        fileName: img.name,
        filePath: img.path
      });

      const imageItem = document.createElement('div');
      imageItem.className = 'poster-item';
      imageItem.dataset.fileName = img.name;
      imageItem.draggable = true;

      const titleElement = document.createElement('div');
      titleElement.className = 'poster-item-title';
      titleElement.textContent = img.name;
      titleElement.style.fontSize = '0.85em';

      const infoElement = document.createElement('div');
      infoElement.className = 'poster-item-info';
      infoElement.textContent = 'Centralized';

      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'poster-item-buttons';
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'center';
      buttonContainer.style.padding = '5px 0';

      const editBtn = document.createElement('button');
      editBtn.className = 'editor-btn small';
      editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
      editBtn.style.marginRight = '5px';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadImageToEditor(img.path);
      });

      buttonContainer.appendChild(editBtn);

      imageItem.appendChild(titleElement);
      imageItem.appendChild(infoElement);
      imageItem.appendChild(buttonContainer);

      imageItem.addEventListener('click', () => showImagePreview(img.path));

      // Drag support
      imageItem.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', img.path);
        e.dataTransfer.effectAllowed = 'copy';
        imageItem.classList.add('dragging');
      });

      imageItem.addEventListener('dragend', () => {
        imageItem.classList.remove('dragging');
      });

      imagesList.appendChild(imageItem);
    }

    if (allImages.length > 50) {
      const moreNotice = document.createElement('div');
      moreNotice.style.padding = '10px';
      moreNotice.style.color = '#888';
      moreNotice.style.fontSize = '0.9em';
      moreNotice.textContent = `... and ${allImages.length - 50} more images`;
      imagesList.appendChild(moreNotice);
    }

    // Add section for posters with images in current category
    if (postersWithImages.length > 0) {
      const posterHeader = document.createElement('div');
      posterHeader.className = 'section-header';
      const label = currentCategory ? currentCategory : 'All Categories';
      posterHeader.innerHTML = `<strong>📄 ${label} Posters (${postersWithImages.length})</strong>`;
      posterHeader.style.padding = '10px';
      posterHeader.style.borderTop = '2px solid #555';
      posterHeader.style.borderBottom = '1px solid #444';
      posterHeader.style.marginTop = '10px';
      posterHeader.style.marginBottom = '5px';
      imagesList.appendChild(posterHeader);

      for (const poster of postersWithImages) {
        const imageSrc = poster.back.image.src;

        const posterItem = document.createElement('div');
        posterItem.className = 'poster-item';
        posterItem.dataset.posterPath = poster.path;

        const titleElement = document.createElement('div');
        titleElement.className = 'poster-item-title';
        titleElement.textContent = poster.front?.title || poster.filename;

        const infoElement = document.createElement('div');
        infoElement.className = 'poster-item-info';
        infoElement.textContent = `Image: ${imageSrc.split('/').pop()}`;
        infoElement.style.fontSize = '0.8em';

        posterItem.appendChild(titleElement);
        posterItem.appendChild(infoElement);

        posterItem.addEventListener('click', () => showImagePreview(imageSrc, poster.path));

        imagesList.appendChild(posterItem);
      }
    }

  } catch (error) {
    console.error('Error loading images:', error);
    showErrorMessage('Failed to load images. Please try again later.');
  }
}

// Show an image preview (could expand to allow deletion, etc.)
function showImagePreview(imagePath, posterPath) {
  // Extract filename from path for display
  let fileName = imagePath.split('/').pop();

  // If it's in the images subdirectory, also extract that information
  const isInImagesDir = imagePath.includes('/images/');
  if (isInImagesDir) {
    fileName = imagePath.split('/images/')[1];
  }

  // Create a temporary overlay to show the image
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.zIndex = '1000';

  const imgContainer = document.createElement('div');
  imgContainer.style.position = 'relative';
  imgContainer.style.maxWidth = '90%';
  imgContainer.style.maxHeight = '90%';

  const img = document.createElement('img');
  img.src = imagePath;
  img.style.maxWidth = '100%';
  img.style.maxHeight = '80vh';
  img.style.objectFit = 'contain';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.className = 'editor-btn danger';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '-40px';
  closeBtn.style.right = '0';
  closeBtn.style.fontSize = '24px';
  closeBtn.style.padding = '5px 15px';

  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'space-between';
  buttonContainer.style.marginTop = '10px';
  buttonContainer.style.width = '100%';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit in Editor';
  editBtn.className = 'editor-btn primary';
  editBtn.style.marginTop = '10px';
  editBtn.addEventListener('click', () => {
    loadImageToEditor(imagePath);
    document.body.removeChild(overlay);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.className = 'editor-btn danger';
  deleteBtn.style.marginTop = '10px';

  buttonContainer.appendChild(editBtn);
  buttonContainer.appendChild(deleteBtn);

  // Add location info for the image
  const locationInfo = document.createElement('div');
  locationInfo.style.padding = '10px';
  locationInfo.style.marginTop = '10px';
  locationInfo.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  locationInfo.style.borderRadius = '4px';
  locationInfo.style.color = '#aaa';
  locationInfo.style.fontSize = '12px';

  if (isInImagesDir) {
    locationInfo.textContent = `Location: images/${fileName} (In images subdirectory)`;
  } else {
    locationInfo.textContent = `Location: ${fileName} (In main directory)`;
  }

  imgContainer.appendChild(img);
  imgContainer.appendChild(closeBtn);
  imgContainer.appendChild(buttonContainer);
  imgContainer.appendChild(locationInfo);
  overlay.appendChild(imgContainer);
  document.body.appendChild(overlay);

  // Close button handler
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // Delete button handler
  deleteBtn.addEventListener('click', () => {
    confirmDeleteImage(imagePath, posterPath);
    document.body.removeChild(overlay);
  });
}

// Load image from gallery to editor
function loadImageToEditor(imagePath) {
  console.log("Loading image to editor:", imagePath);

  // Create a temporary image to load the file
  const img = new Image();
  img.crossOrigin = 'Anonymous';

  img.onload = function () {
    // Get the filename from the path
    const fileName = imagePath.split('/').pop();

    // Convert the image to a canvas to get its data
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Convert to blob and create a File object
    canvas.toBlob(blob => {
      const file = new File([blob], fileName, {
        type: `image/${getImageTypeFromFileName(fileName)}`
      });
      handleFiles([file]);
    }, `image/${getImageTypeFromFileName(fileName)}`);
  };

  img.onerror = function () {
    console.error("Failed to load image:", imagePath);
    alert("Failed to load the image. Please try again.");
  };

  // Load the image from the server
  img.src = imagePath;
}

// Confirm delete image (and optionally its associated poster JSON)
function confirmDeleteImage(imagePath, posterPath) {
  const fileName = imagePath.split('/').pop();
  const extra = posterPath ? ' The associated poster entry will also be removed.' : '';
  dialogMessage.textContent = `Are you sure you want to delete "${fileName}"?${extra} This action cannot be undone.`;
  dialogCallback = () => deleteImage(imagePath, posterPath);
  openDialog();
}

// Delete an image file and, if provided, its associated poster JSON
async function deleteImage(imagePath, posterPath) {
  try {
    // Delete the image file
    const response = await fetch('/api/delete-poster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: imagePath })
    });
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    // Also delete the associated poster JSON if we know the path
    if (posterPath) {
      try {
        // Send only the filename, not the full path, for server-side validation
        const posterFilename = posterPath.split('/').pop();
        const posterResp = await fetch('/api/delete-poster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: posterFilename })
        });
        if (!posterResp.ok) {
          console.warn(`Could not delete associated poster JSON: server returned ${posterResp.status}`);
        }
      } catch (imgErr) {
        console.warn('Could not delete associated poster JSON:', imgErr);
      }
    }

    alert('Deleted successfully!');
    await loadImagesFromCategory();
  } catch (error) {
    console.error('Error deleting image:', error);
    showErrorMessage('Failed to delete image. Please try again.');
  }
}

// Create category via metadata in posters (no directory creation)

// Image uploader functions

// Drag and drop functions
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();

  // Add the active class to indicate the dropzone is ready to accept the drop
  dropzone.classList.add('active');
  dropzone.classList.add('drag-over');

  // Set the drop effect to 'copy' to indicate we're copying the file
  e.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();

  // Remove the active class when the drag leaves the dropzone
  dropzone.classList.remove('active');
  dropzone.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('active');

  // Handle files dropped from file system
  if (e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files);
    return;
  }

  // Handle images dragged from gallery
  const filePath = e.dataTransfer.getData('text/plain');
  if (filePath && (filePath.startsWith(POSTERS_DIR) || filePath.includes('/images/'))) {
    console.log("Loading gallery image:", filePath);

    // Create a temporary image to load the file
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = function () {
      // Get the filename from the path
      const fileName = filePath.split('/').pop();

      // Convert the image to a canvas to get its data
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Convert to blob and create a File object
      canvas.toBlob(blob => {
        const file = new File([blob], fileName, {
          type: `image/${getImageTypeFromFileName(fileName)}`
        });
        handleFiles([file]);
      }, `image/${getImageTypeFromFileName(fileName)}`);
    };

    img.onerror = function () {
      console.error("Failed to load image:", filePath);
      alert("Failed to load the image. Please try again.");
    };

    // Load the image from the server
    img.src = filePath;
  }
}

// Helper function to determine image type from filename
function getImageTypeFromFileName(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'gif':
      return 'gif';
    case 'webp':
      return 'webp';
    default:
      return 'jpeg'; // fallback
  }
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length) {
    handleFiles(files);
    fileInput.value = ''; // Reset input to allow selecting same file again
  }
}

// Paste functions
function handlePasteClick() {
  alert('Press Ctrl+V or right-click paste to paste an image');
}

function handlePaste(e) {
  const items = (e.clipboardData || window.clipboardData).items;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const blob = items[i].getAsFile();
      const file = new File([blob], 'pasted-image.png', { type: 'image/png' });
      handleFiles([file]);
      break;
    }
  }
}

// URL loading
function loadImageFromUrl() {
  const url = imageUrl.value.trim();
  if (!url) return;

  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    alert('Please enter a valid URL');
    return;
  }

  // Create a temporary image to check if it loads
  const img = new Image();
  img.crossOrigin = 'Anonymous';

  img.onload = function () {
    // Convert the image to a blob
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    canvas.toBlob(blob => {
      const filename = url.split('/').pop() || 'downloaded-image.jpg';
      const file = new File([blob], filename, { type: 'image/jpeg' });
      handleFiles([file]);
      imageUrl.value = '';
    }, 'image/jpeg');
  };

  img.onerror = function () {
    alert('Error loading image from URL. Please check the URL and try again.');
  };

  img.src = url;
}

// Main image handling
function handleFiles(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.match('image.*')) continue;

    const reader = new FileReader();
    reader.onload = function (e) {
      const imageData = {
        id: Date.now() + i,
        name: file.name,
        originalFile: file,
        originalDataUrl: e.target.result,
        processedDataUrl: null,
        selected: false
      };

      images.push(imageData);
      updateUI();
      renderImagePreview(imageData);
    };
    reader.readAsDataURL(file);
  }
}

function renderImagePreview(imageData) {
  const previewItem = document.createElement('div');
  previewItem.className = 'preview-item';
  previewItem.dataset.id = imageData.id;

  const img = document.createElement('img');
  img.src = imageData.originalDataUrl;
  img.alt = imageData.name;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'absolute top-2 left-2 h-4 w-4 text-blue-600';
  checkbox.style.position = 'absolute';
  checkbox.style.top = '5px';
  checkbox.style.left = '5px';
  checkbox.checked = imageData.selected;
  checkbox.addEventListener('change', function () {
    imageData.selected = this.checked;
    updateUI();
  });

  const previewActions = document.createElement('div');
  previewActions.className = 'preview-actions';

  // We'll store the base filename without extension for metadata use
  const baseName = imageData.name.split('.')[0];
  if (!imageData.customFilename) {
    imageData.customFilename = baseName;
  }

  const filenameEditor = document.createElement('div');
  filenameEditor.style.position = 'absolute';
  filenameEditor.style.left = '0';
  filenameEditor.style.right = '0';
  filenameEditor.style.top = '0';
  filenameEditor.style.background = 'rgba(0, 0, 0, 0.6)';
  filenameEditor.style.padding = '4px 6px';
  filenameEditor.style.display = 'flex';
  filenameEditor.style.alignItems = 'center';

  const filenameInput = document.createElement('input');
  filenameInput.type = 'text';
  filenameInput.value = imageData.customFilename;
  filenameInput.placeholder = 'Filename';
  filenameInput.title = 'Filename (without extension)';
  filenameInput.style.width = '100%';
  filenameInput.style.fontSize = '0.8em';
  filenameInput.style.padding = '3px 6px';
  filenameInput.style.borderRadius = '4px';
  filenameInput.style.border = '1px solid #3a355e';
  filenameInput.style.background = '#201c46';
  filenameInput.style.color = '#fff';
  filenameInput.addEventListener('input', () => {
    imageData.customFilename = filenameInput.value.trim();
  });
  filenameInput.addEventListener('click', (e) => e.stopPropagation());

  filenameEditor.appendChild(filenameInput);

  const cropBtn = document.createElement('button');
  cropBtn.className = 'text-white hover:text-blue-300';
  cropBtn.innerHTML = '<i class="fas fa-crop-alt"></i>';
  cropBtn.title = 'Crop';
  cropBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    openCropModal(imageData.id);
  });

  const editNameBtn = document.createElement('button');
  editNameBtn.className = 'text-white hover:text-blue-300';
  editNameBtn.innerHTML = '<i class="fas fa-edit"></i>';
  editNameBtn.title = 'Edit Metadata';
  editNameBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    // Select the image
    imageData.selected = true;
    checkbox.checked = true;
    updateUI();

    // Show the metadata panel and scroll to it
    if (useJsonWrapper) {
      useJsonWrapper.checked = true;
      imageMetadataPanel.style.display = 'block';
    }

    // Fill in metadata from current image
    imageTitle.value = imageData.customFilename || baseName;
    imageDescription.value = '';
    imageAltText.value = '';
    imageFilename.value = '';

    // Focus on the title field
    imageTitle.focus();

    // Scroll to the metadata section
    processingOptions.scrollIntoView({ behavior: 'smooth' });
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'text-white hover:text-red-300';
  deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
  deleteBtn.title = 'Delete';
  deleteBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    removeImage(imageData.id);
  });

  previewActions.appendChild(cropBtn);
  previewActions.appendChild(editNameBtn);
  previewActions.appendChild(deleteBtn);

  previewItem.appendChild(img);
  previewItem.appendChild(checkbox);
  previewItem.appendChild(filenameEditor);
  previewItem.appendChild(previewActions);

  imagePreviews.appendChild(previewItem);
}

function updateUI() {
  // Update image count
  imageCount.textContent = `${images.length} image${images.length !== 1 ? 's' : ''}`;

  // Show/hide processing options
  processingOptions.style.display = images.length ? 'block' : 'none';

  // Update selected count for crop button
  const selectedCount = images.filter(img => img.selected).length;
  cropSelectedBtn.textContent = selectedCount > 0 ? `Crop Selected (${selectedCount})` : 'Crop Selected';
  cropSelectedBtn.disabled = selectedCount === 0;

  // Enable/disable save button
  saveAllBtn.disabled = images.length === 0;
}

function removeImage(id) {
  images = images.filter(img => img.id !== id);
  document.querySelector(`.preview-item[data-id="${id}"]`).remove();
  updateUI();
}

function clearAllImages() {
  if (images.length === 0 || !confirm('Are you sure you want to clear all images?')) return;

  images = [];
  imagePreviews.innerHTML = '';
  updateUI();
}

// Image processing functions
function processAllImages() {
  Promise.all(
    images.map(imageData => processImage(imageData, 'webp', 0.85, null, null, true))
  ).then(() => {
    alert('All images have been processed!');
  });
}

function processImage(imageData, format, quality, width, height, keepAspect) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function () {
      let targetWidth = width;
      let targetHeight = height;

      // Calculate dimensions while maintaining aspect ratio if needed
      if (keepAspect && (width || height)) {
        const aspectRatio = img.width / img.height;

        if (width && !height) {
          targetHeight = Math.round(width / aspectRatio);
        } else if (height && !width) {
          targetWidth = Math.round(height * aspectRatio);
        } else if (width && height) {
          // Find which dimension is more limiting
          const widthRatio = width / img.width;
          const heightRatio = height / img.height;
          const ratio = Math.min(widthRatio, heightRatio);

          targetWidth = Math.round(img.width * ratio);
          targetHeight = Math.round(img.height * ratio);
        }
      }

      // If no dimensions specified, use original
      if (!targetWidth) targetWidth = img.width;
      if (!targetHeight) targetHeight = img.height;

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const mimeType = 'image/webp';

      // Get processed data URL
      canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = function () {
          imageData.processedDataUrl = reader.result;
          updateImagePreview(imageData);
          resolve();
        };
        reader.readAsDataURL(blob);
      }, mimeType, quality);
    };
    img.src = imageData.processedDataUrl || imageData.originalDataUrl;
  });
}

function updateImagePreview(imageData) {
  const previewItem = document.querySelector(`.preview-item[data-id="${imageData.id}"]`);
  if (previewItem) {
    const img = previewItem.querySelector('img');
    img.src = imageData.processedDataUrl || imageData.originalDataUrl;
  }
}

// AI image generation for image editor
async function generateAiImageForEditor() {
  const titleInput = document.getElementById('aiImageTitle');
  const statusEl = document.getElementById('aiImageStatus');
  const btn = document.getElementById('aiGenerateImageBtn');
  const title = (titleInput?.value || '').trim();
  if (!title) { if (statusEl) statusEl.textContent = 'Enter a description first.'; return; }
  btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Generating…';
  try {
    const resp = await fetch('/api/ai/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!resp.ok) {
      let msg = 'Generation failed';
      try { msg = (await resp.json()).error || msg; } catch (_) {}
      if (statusEl) statusEl.textContent = msg;
      return;
    }
    const data = await resp.json();
    // Register the server-saved image directly — avoid re-uploading a duplicate
    const filename = data.src.split('/').pop();
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/webp', 0.85);
      const imageData = {
        id: Date.now(),
        name: filename,
        originalFile: null,
        originalDataUrl: dataUrl,
        processedDataUrl: null,
        serverSrc: data.src,
        selected: false
      };
      images.push(imageData);
      updateUI();
      renderImagePreview(imageData);
      if (statusEl) statusEl.textContent = 'Done!';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    };
    img.onerror = () => {
      if (statusEl) statusEl.textContent = 'Failed to load generated image';
    };
    img.src = data.src;
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Request failed';
    console.error('[AI generate]', err);
  } finally {
    btn.disabled = false;
  }
}

// Cropping functions
function openCropModalForSelected() {
  const selectedImages = images.filter(img => img.selected);
  if (selectedImages.length > 0) {
    openCropModal(selectedImages[0].id);
  } else {
    // If no images are selected but there are images available, select the first one
    if (images.length > 0) {
      images[0].selected = true;
      // Update the checkbox UI
      const checkbox = document.querySelector(`.preview-item[data-id="${images[0].id}"] input[type="checkbox"]`);
      if (checkbox) checkbox.checked = true;
      updateUI();
      openCropModal(images[0].id);
    } else {
      alert('Please upload or select an image to crop.');
    }
  }
}

function openCropModal(id) {
  currentCropIndex = images.findIndex(img => img.id === id);
  if (currentCropIndex === -1) return;

  const imageData = images[currentCropIndex];
  imageToCrop.src = imageData.processedDataUrl || imageData.originalDataUrl;

  // Show modal
  cropModal.style.display = 'flex';

  // Initialize cropper
  if (cropper) {
    cropper.destroy();
  }

  cropper = new Cropper(imageToCrop, {
    aspectRatio: NaN, // Free aspect ratio
    viewMode: 1,
    autoCropArea: 0.8,
    responsive: true,
    restore: false,
    guides: true,
    center: true,
    highlight: true,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
  });

  document.body.style.overflow = 'hidden';
}

function closeCropperModal() {
  cropModal.style.display = 'none';
  document.body.style.overflow = '';

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

function applyCrop() {
  if (currentCropIndex === -1 || !cropper) {
    closeCropperModal();
    return;
  }

  const imageData = images[currentCropIndex];

  // Get cropped canvas
  const canvas = cropper.getCroppedCanvas({
    width: cropper.getCropBoxData().width,
    height: cropper.getCropBoxData().height,
    minWidth: 50,
    minHeight: 50,
    maxWidth: 4096,
    maxHeight: 4096,
    fillColor: '#fff',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });

  canvas.toBlob(blob => {
    const reader = new FileReader();
    reader.onload = function () {
      imageData.processedDataUrl = reader.result;
      updateImagePreview(imageData);
      closeCropperModal();
    };
    reader.readAsDataURL(blob);
  }, 'image/webp', 0.85);
}

// Save all images to the centralized images folder
async function saveAllImagesToGallery() {
  if (images.length === 0) {
    alert('No images to save.');
    return;
  }

  const createPosterJson = useJsonWrapper.checked;

  // Always WebP at standard quality; use crop tool to adjust composition
  const format = 'webp';
  const quality = 0.85;
  const width = null;
  const height = null;
  const keepAspect = true;

  console.log("Save options:", {
    format,
    quality,
    width,
    height,
    keepAspect,
    createPosterJson
  });

  // Get the title value if it exists, to be used as the common filename
  let commonFilename = '';
  if (imageFilename.value.trim()) {
    // If explicit filename is provided, use that
    commonFilename = imageFilename.value.trim();
  } else if (imageTitle.value.trim()) {
    // Otherwise, fall back to title if available
    commonFilename = imageTitle.value.trim();
  }

  // Sanitize the filename
  if (commonFilename) {
    commonFilename = commonFilename
      .replace(/[^a-zA-Z0-9_-]/g, '_') // Replace invalid chars with underscore
      .replace(/_{2,}/g, '_')          // Replace multiple underscores with single
      .replace(/^_|_$/g, '');          // Remove leading/trailing underscores
  }

  console.log("Metadata values:", {
    title: imageTitle.value,
    description: imageDescription.value,
    alt: imageAltText.value,
    filename: imageFilename.value,
    commonFilename: commonFilename
  });

  // First process all images
  await Promise.all(
    images.filter(img => !img.processedDataUrl).map(img =>
      processImage(img, format, quality, width, height, keepAspect)
    )
  );

  // Function to convert data URL to Blob
  function dataURLToBlob(dataURL) {
    const parts = dataURL.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  }

  // Centralized images directory
  const CENTRALIZED_IMAGES_DIR = 'images/originals';

  // Ensure the centralized images directory exists
  try {
    const checkDirResponse = await fetch('/api/check-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: CENTRALIZED_IMAGES_DIR })
    });

    const dirCheckResult = await checkDirResponse.json();

    if (!dirCheckResult.exists) {
      const createDirResponse = await fetch('/api/create-images-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: CENTRALIZED_IMAGES_DIR })
      });

      if (!createDirResponse.ok) {
        throw new Error(`Failed to create images directory: ${await createDirResponse.text()}`);
      }
    }
  } catch (error) {
    console.error('Error preparing images directory:', error);
    alert('Failed to prepare images directory. Check console for details.');
    return;
  }

  // Now save each image
  let savedCount = 0;
  let errorCount = 0;

  for (const imageData of images) {
    // Skip images already persisted on the server (e.g. AI-generated assets)
    if (imageData.serverSrc) {
      savedCount++;
      continue;
    }
    try {
      const imageUrl = imageData.processedDataUrl || imageData.originalDataUrl;
      const blob = dataURLToBlob(imageUrl);

      // Get file extension based on format
      let ext;
      switch (format) {
        case 'jpeg': ext = 'jpg'; break;
        case 'png': ext = 'png'; break;
        default: ext = 'webp';
      }

      // Create a sanitized filename
      let baseName = '';

      if (commonFilename && images.length === 1) {
        baseName = commonFilename;
      } else if (commonFilename && images.length > 1) {
        baseName = `${commonFilename}_${savedCount + 1}`;
      } else {
        baseName = imageData.customFilename || imageData.name.split('.')[0];
        baseName = baseName
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_|_$/g, '');
      }

      if (!baseName) baseName = `image_${Date.now()}`;

      const fileName = `${baseName}.${ext}`;
      const filePath = `${CENTRALIZED_IMAGES_DIR}/${fileName}`;

      // Convert blob to File
      const file = new File([blob], fileName, { type: blob.type });
      const formData = new FormData();
      formData.append('image', file);
      formData.append('path', filePath);

      // Check if file exists in centralized location
      // We'll do a simple fetch to see if the image exists
      const existsCheck = await fetch(filePath, { method: 'HEAD' }).catch(() => null);
      if (existsCheck && existsCheck.ok) {
        if (!confirm(`File "${fileName}" already exists in images/originals. Overwrite?`)) {
          continue;
        }
      }

      // Save the image file to centralized location
      const response = await fetch('/api/save-image', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      console.log(`Image saved to: ${filePath}`);

      // If poster JSON is requested, create a v2 poster JSON in the selected category
      if (createPosterJson) {
        console.log("Creating v2 poster JSON...");

        // Get metadata values
        const title = imageTitle.value.trim() || baseName.replace(/_/g, ' ');
        const description = imageDescription.value.trim() || '';
        const alt = imageAltText.value.trim() || title;

        // Get category from current directory selection
        const categoryName = currentCategory || 'Uncategorized';

        // Create v2 poster object
        const posterData = {
          version: 2,
          type: 'poster-v2',
          uid: `poster-${Date.now()}`,
          front: {
            title: title
          },
          back: {
            layout: 'image-top',
            text: description,
            image: {
              src: filePath,
              alt: alt,
              position: 'top'
            }
          },
          meta: {
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            categories: [categoryName]
          }
        };

        // Remove empty text if no description
        if (!description) {
          delete posterData.back.text;
        }

        const jsonContent = JSON.stringify(posterData, null, 2);
        console.log("v2 Poster JSON:", jsonContent);

        // Create JSON file in the selected category directory
        const jsonFileName = `${baseName}.json`;
        const jsonFilePath = `${POSTERS_DIR}/${jsonFileName}`;

        // Create FormData for the JSON file
        const jsonFormData = new FormData();
        const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
        const jsonFile = new File([jsonBlob], jsonFileName, { type: 'application/json' });

        jsonFormData.append('file', jsonFile);
        jsonFormData.append('path', jsonFilePath);

        console.log("Saving poster JSON:", jsonFileName, "to:", jsonFilePath);

        const jsonResponse = await fetch('/api/save-file', {
          method: 'POST',
          body: jsonFormData
        });

        if (!jsonResponse.ok) {
          const errorText = await jsonResponse.text();
          console.error("Error response from server:", errorText);
          throw new Error(`Server returned ${jsonResponse.status}: ${jsonResponse.statusText}`);
        }

        console.log("v2 poster saved successfully");
      }

      savedCount++;
    } catch (error) {
      console.error(`Error saving image ${imageData.name}:`, error);
      errorCount++;
    }
  }

  // Show summary message
  if (errorCount > 0) {
    alert(`Saved ${savedCount} images. ${errorCount} images failed to save.`);
  } else {
    const posterNote = createPosterJson ? ' Poster JSON files created in selected category.' : '';
    alert(`All ${savedCount} images saved to images/originals!${posterNote}`);
  }

  // Reset metadata fields
  imageTitle.value = '';
  imageDescription.value = '';
  imageAltText.value = '';
  imageFilename.value = '';

  // Clear the processed images
  clearAllImages();
}

// Dialog functions
function openDialog() {
  confirmationDialog.style.display = 'flex';
}

function closeDialog() {
  confirmationDialog.style.display = 'none';
  dialogCallback = null;
}

// Show error message
function showErrorMessage(message) {
  alert(message);
}
