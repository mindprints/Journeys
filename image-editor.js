// image-editor.js - Functionality for the image editor

// DOM Elements
const directoryChooser = document.getElementById('directory-chooser');
const imagesList = document.getElementById('images-list');
const refreshBtn = document.getElementById('refresh-btn');
const newDirectoryBtn = document.getElementById('new-directory-btn');
const newDirectoryDialog = document.getElementById('new-directory-dialog');
const newDirectoryNameInput = document.getElementById('new-directory-name');
const createDirectoryBtn = document.getElementById('create-directory-btn');
const cancelDirectoryBtn = document.getElementById('cancel-directory-btn');
const confirmationDialog = document.getElementById('confirmation-dialog');
const dialogConfirmBtn = document.getElementById('dialog-confirm');
const dialogCancelBtn = document.getElementById('dialog-cancel');
const dialogMessage = document.getElementById('dialog-message');

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
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const resizeWidth = document.getElementById('resizeWidth');
const resizeHeight = document.getElementById('resizeHeight');
const maintainAspect = document.getElementById('maintainAspect');
const useJsonWrapper = document.getElementById('useJsonWrapper');
const imageMetadataPanel = document.getElementById('imageMetadataPanel');
const imageTitle = document.getElementById('imageTitle');
const imageDescription = document.getElementById('imageDescription');
const imageAltText = document.getElementById('imageAltText');

// Crop Modal Elements
const cropModal = document.getElementById('cropModal');
const imageToCrop = document.getElementById('imageToCrop');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const applyCropBtn = document.getElementById('applyCropBtn');

// Global Variables
let currentDirectory = '';
let existingImages = [];
let images = [];
let currentCropIndex = -1;
let cropper = null;
let dialogCallback = null;

// Initialize the editor
document.addEventListener('DOMContentLoaded', () => {
  populateDirectoryChooser();
  initializeImageUploader();
  
  // Event listeners for directory and gallery functions
  directoryChooser.addEventListener('change', loadImagesFromDirectory);
  refreshBtn.addEventListener('click', loadImagesFromDirectory);
  
  // New directory related events
  newDirectoryBtn.addEventListener('click', openNewDirectoryDialog);
  createDirectoryBtn.addEventListener('click', createNewDirectory);
  cancelDirectoryBtn.addEventListener('click', closeNewDirectoryDialog);
  
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
  
  // Quality slider
  qualitySlider.addEventListener('input', updateQualityValue);
  
  // Aspect ratio maintenance
  resizeWidth.addEventListener('input', handleResizeInput);
  resizeHeight.addEventListener('input', handleResizeInput);
  
  // Button actions
  clearAllBtn.addEventListener('click', clearAllImages);
  processAllBtn.addEventListener('click', processAllImages);
  cropSelectedBtn.addEventListener('click', openCropModalForSelected);
  saveAllBtn.addEventListener('click', saveAllImagesToGallery);
  
  // Crop modal events
  cancelCropBtn.addEventListener('click', closeCropperModal);
  applyCropBtn.addEventListener('click', applyCrop);
  
  // JSON wrapper options
  useJsonWrapper.addEventListener('change', function() {
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

// Populate directory chooser with JSON_Posters subdirectories
async function populateDirectoryChooser() {
  try {
    const response = await fetch('/api/directories');
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const directories = await response.json();
    
    // Clear existing options
    directoryChooser.innerHTML = '';
    
    // Add each directory as an option
    directories.forEach(directory => {
      const option = document.createElement('option');
      option.value = `JSON_Posters/${directory}`;
      
      // Format the display name
      let displayName = directory
        .replace(/([A-Z])/g, ' $1') // Convert camelCase to spaces
        .replace(/_/g, ' ')         // Convert snake_case to spaces
        .replace(/^\w/, c => c.toUpperCase()); // Capitalize first letter
      
      option.textContent = displayName;
      directoryChooser.appendChild(option);
    });
    
    // Select the first option by default and load its images
    if (directoryChooser.options.length > 0) {
      directoryChooser.selectedIndex = 0;
      loadImagesFromDirectory();
    }
  } catch (error) {
    console.error('Error loading directories:', error);
    showErrorMessage('Failed to load directories. Please try again later.');
  }
}

// Load images from the selected directory
async function loadImagesFromDirectory() {
  currentDirectory = directoryChooser.value;
  existingImages = [];
  
  try {
    // Clear existing images list
    imagesList.innerHTML = '';
    
    // Fetch files from the selected directory
    const response = await fetch(`/api/posters?directory=${currentDirectory}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const fileList = await response.json();
    
    // Check if the images subdirectory exists
    const imagesDir = `${currentDirectory}/images`;
    const checkDirResponse = await fetch('/api/check-directory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: imagesDir })
    });
    
    const dirCheckResult = await checkDirResponse.json();
    
    // If images directory exists, fetch its contents as well
    let imagesFileList = [];
    if (dirCheckResult.exists) {
      const imagesResponse = await fetch(`/api/posters?directory=${imagesDir}`);
      if (imagesResponse.ok) {
        imagesFileList = await imagesResponse.json();
      }
    }
    
    // Filter for image files (non-JSON files)
    // First from main directory
    const imageFiles = fileList.filter(file => {
      const ext = file.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    });
    
    // Then from images subdirectory
    const imagesSubdirFiles = imagesFileList.map(file => `images/${file}`);
    
    // Combine both sets of images
    const allImageFiles = [...imageFiles, ...imagesSubdirFiles];
    
    // Create list items for each image
    for (const fileName of allImageFiles) {
      try {
        const filePath = `${currentDirectory}/${fileName}`;
        existingImages.push({
          fileName,
          filePath
        });
        
        // Create list item for the image
        const imageItem = document.createElement('div');
        imageItem.className = 'poster-item';
        imageItem.dataset.fileName = fileName;
        
        // Display a nicer name without the images/ prefix if present
        const displayName = fileName.startsWith('images/') 
          ? fileName.substring(7) // Remove 'images/' prefix
          : fileName;
        
        imageItem.innerHTML = `
          <div class="poster-item-title">${displayName}</div>
          <div class="poster-item-info">Image</div>
        `;
        
        imageItem.addEventListener('click', () => showImagePreview(filePath));
        
        imagesList.appendChild(imageItem);
      } catch (error) {
        console.error(`Error loading image ${fileName}:`, error);
      }
    }
    
  } catch (error) {
    console.error('Error loading images:', error);
    showErrorMessage('Failed to load images. Please try again later.');
  }
}

// Show an image preview (could expand to allow deletion, etc.)
function showImagePreview(imagePath) {
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
  
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.className = 'editor-btn danger';
  deleteBtn.style.marginTop = '10px';

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
  imgContainer.appendChild(deleteBtn);
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
    confirmDeleteImage(imagePath);
    document.body.removeChild(overlay);
  });
}

// Confirm delete image
function confirmDeleteImage(imagePath) {
  const fileName = imagePath.split('/').pop();
  
  dialogMessage.textContent = `Are you sure you want to delete "${fileName}"? This action cannot be undone.`;
  dialogCallback = () => deleteImage(imagePath);
  
  // Show the confirmation dialog
  openDialog();
}

// Delete an image
async function deleteImage(imagePath) {
  try {
    const response = await fetch('/api/delete-poster', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: imagePath
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    // Show success message
    alert(`Image deleted successfully!`);
    
    // Reload images from directory
    await loadImagesFromDirectory();
    
  } catch (error) {
    console.error('Error deleting image:', error);
    showErrorMessage('Failed to delete image. Please try again.');
  }
}

// Create a new directory
async function createNewDirectory() {
  const directoryName = newDirectoryNameInput.value.trim();
  
  if (!directoryName) {
    alert('Please enter a directory name');
    return;
  }
  
  try {
    const response = await fetch('/api/create-directory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: directoryName
      })
    });
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned non-JSON response. Please try again.');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create directory');
    }
    
    // Close the dialog
    closeNewDirectoryDialog();
    
    // Refresh the directory chooser
    await populateDirectoryChooser();
    
    // Select the newly created directory
    for (let i = 0; i < directoryChooser.options.length; i++) {
      if (directoryChooser.options[i].value === data.path) {
        directoryChooser.selectedIndex = i;
        break;
      }
    }
    
    // Load images for the new directory (which will be empty)
    loadImagesFromDirectory();
    
    // Show success message
    alert(`Category "${directoryName}" created successfully!`);
    
  } catch (error) {
    console.error('Error creating directory:', error);
    alert(`Error creating directory: ${error.message}`);
  }
}

// Image uploader functions

// Drag and drop functions
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.add('active');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('active');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('active');
  
  const files = e.dataTransfer.files;
  if (files.length) {
    handleFiles(files);
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
  
  img.onload = function() {
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
  
  img.onerror = function() {
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
    reader.onload = function(e) {
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
  checkbox.addEventListener('change', function() {
    imageData.selected = this.checked;
    updateUI();
  });
  
  const previewActions = document.createElement('div');
  previewActions.className = 'preview-actions';
  
  // Add filename edit field
  const filenameContainer = document.createElement('div');
  filenameContainer.className = 'filename-container';
  filenameContainer.style.position = 'absolute';
  filenameContainer.style.bottom = '0';
  filenameContainer.style.left = '0';
  filenameContainer.style.right = '0';
  filenameContainer.style.backgroundColor = 'rgba(0,0,0,0.7)';
  filenameContainer.style.padding = '5px';
  filenameContainer.style.display = 'none';
  
  // Get the base filename without extension
  const baseName = imageData.name.split('.')[0];
  
  const filenameInput = document.createElement('input');
  filenameInput.type = 'text';
  filenameInput.value = baseName;
  filenameInput.className = 'filename-input';
  filenameInput.style.width = '100%';
  filenameInput.style.backgroundColor = '#201c46';
  filenameInput.style.border = '1px solid #3a355e';
  filenameInput.style.borderRadius = '4px';
  filenameInput.style.padding = '4px';
  filenameInput.style.color = 'white';
  filenameInput.placeholder = 'Enter filename';
  filenameInput.addEventListener('change', function() {
    // Store the custom filename in the imageData
    imageData.customFilename = this.value.trim();
  });
  
  filenameContainer.appendChild(filenameInput);
  
  const cropBtn = document.createElement('button');
  cropBtn.className = 'text-white hover:text-blue-300';
  cropBtn.innerHTML = '<i class="fas fa-crop-alt"></i>';
  cropBtn.title = 'Crop';
  cropBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    openCropModal(imageData.id);
  });
  
  const editNameBtn = document.createElement('button');
  editNameBtn.className = 'text-white hover:text-blue-300';
  editNameBtn.innerHTML = '<i class="fas fa-edit"></i>';
  editNameBtn.title = 'Edit Filename';
  editNameBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    // Toggle filename edit field
    if (filenameContainer.style.display === 'none') {
      filenameContainer.style.display = 'block';
    } else {
      filenameContainer.style.display = 'none';
    }
  });
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'text-white hover:text-red-300';
  deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
  deleteBtn.title = 'Delete';
  deleteBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    removeImage(imageData.id);
  });
  
  previewActions.appendChild(cropBtn);
  previewActions.appendChild(editNameBtn);
  previewActions.appendChild(deleteBtn);
  
  previewItem.appendChild(img);
  previewItem.appendChild(checkbox);
  previewItem.appendChild(previewActions);
  previewItem.appendChild(filenameContainer);
  
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
  const format = document.querySelector('input[name="outputFormat"]:checked').value;
  const quality = parseInt(qualitySlider.value) / 100;
  const width = resizeWidth.value ? parseInt(resizeWidth.value) : null;
  const height = resizeHeight.value ? parseInt(resizeHeight.value) : null;
  const keepAspect = maintainAspect.checked;
  
  Promise.all(
    images.map(imageData => processImage(imageData, format, quality, width, height, keepAspect))
  ).then(() => {
    alert('All images have been processed!');
  });
}

function processImage(imageData, format, quality, width, height, keepAspect) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
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
      
      // Convert to selected format
      let mimeType;
      switch (format) {
        case 'jpeg': mimeType = 'image/jpeg'; break;
        case 'png': mimeType = 'image/png'; break;
        default: mimeType = 'image/webp';
      }
      
      // Get processed data URL
      canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = function() {
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

function updateQualityValue() {
  qualityValue.textContent = `${qualitySlider.value}%`;
}

function handleResizeInput(e) {
  if (!maintainAspect.checked || !e.target.value) return;
  
  const imgIndex = images.findIndex(img => img.selected);
  if (imgIndex === -1) return;
  
  const img = new Image();
  img.onload = function() {
    const aspectRatio = img.width / img.height;
    
    if (e.target === resizeWidth && resizeWidth.value) {
      resizeHeight.value = Math.round(resizeWidth.value / aspectRatio);
    } else if (e.target === resizeHeight && resizeHeight.value) {
      resizeWidth.value = Math.round(resizeHeight.value * aspectRatio);
    }
  };
  
  const imageData = images[imgIndex];
  img.src = imageData.processedDataUrl || imageData.originalDataUrl;
}

// Cropping functions
function openCropModalForSelected() {
  const selectedImages = images.filter(img => img.selected);
  if (selectedImages.length > 0) {
    openCropModal(selectedImages[0].id);
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
  
  // Convert to blob and update image data
  const format = document.querySelector('input[name="outputFormat"]:checked').value;
  const mimeType = format === 'jpeg' ? 'image/jpeg' : (format === 'png' ? 'image/png' : 'image/webp');
  
  canvas.toBlob(blob => {
    const reader = new FileReader();
    reader.onload = function() {
      imageData.processedDataUrl = reader.result;
      updateImagePreview(imageData);
      closeCropperModal();
    };
    reader.readAsDataURL(blob);
  }, mimeType, parseInt(qualitySlider.value) / 100);
}

// Save all images to the gallery
async function saveAllImagesToGallery() {
  if (images.length === 0) {
    alert('No images to save.');
    return;
  }
  
  // Process images if they haven't been processed yet
  const format = document.querySelector('input[name="outputFormat"]:checked').value;
  const quality = parseInt(qualitySlider.value) / 100;
  const width = resizeWidth.value ? parseInt(resizeWidth.value) : null;
  const height = resizeHeight.value ? parseInt(resizeHeight.value) : null;
  const keepAspect = maintainAspect.checked;
  const createJsonWrapper = useJsonWrapper.checked;
  
  console.log("Save options:", {
    format,
    quality,
    width,
    height,
    keepAspect,
    createJsonWrapper
  });
  
  console.log("Metadata values:", {
    title: imageTitle.value,
    description: imageDescription.value,
    alt: imageAltText.value
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
  
  // Make sure the images directory exists for this category
  try {
    // First check if the images directory exists
    const imagesDir = `${currentDirectory}/images`;
    const checkDirResponse = await fetch('/api/check-directory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: imagesDir })
    });
    
    const dirCheckResult = await checkDirResponse.json();
    
    // If directory doesn't exist, create it
    if (!dirCheckResult.exists) {
      const createDirResponse = await fetch('/api/create-images-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: imagesDir })
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
      // Use custom filename if available, otherwise use original name
      let baseName = imageData.customFilename || imageData.name.split('.')[0];
      baseName = baseName
        .replace(/[^a-zA-Z0-9_]/g, '_') // Replace invalid chars with underscore
        .replace(/_{2,}/g, '_')        // Replace multiple underscores with single
        .replace(/^_|_$/g, '');        // Remove leading/trailing underscores
      
      if (!baseName) baseName = `image_${Date.now()}`;
      
      const fileName = `${baseName}.${ext}`;
      const filePath = `${currentDirectory}/images/${fileName}`;
      
      // Convert blob to File
      const file = new File([blob], fileName, { type: blob.type });
      const formData = new FormData();
      formData.append('image', file);
      formData.append('path', filePath);
      
      // Check if file exists and confirm overwrite if needed
      const fileExists = existingImages.some(img => img.fileName === `images/${fileName}`);
      
      if (fileExists) {
        if (!confirm(`File "${fileName}" already exists. Overwrite?`)) {
          continue;
        }
      }
      
      // Save the image file
      const response = await fetch('/api/save-image', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      // If JSON wrapper is requested, create and save the JSON file
      if (createJsonWrapper) {
        console.log("Creating JSON wrapper...");
        
        // Get metadata values (either from user input or defaults)
        const title = imageTitle.value.trim() || baseName;
        const description = imageDescription.value.trim() || '';
        const alt = imageAltText.value.trim() || fileName;
        
        console.log("Using metadata:", { title, description, alt });
        
        // Create JSON wrapper object - point to the image in the images subfolder
        const jsonWrapper = {
          type: "image",
          imagePath: filePath,
          title: title,
          description: description,
          alt: alt,
          annotations: []
        };
        
        // Convert to JSON string
        const jsonContent = JSON.stringify(jsonWrapper, null, 2);
        console.log("JSON content:", jsonContent);
        
        // Create JSON file
        const jsonFileName = `${baseName}.json`;
        const jsonFilePath = `${currentDirectory}/${jsonFileName}`;
        
        // Check if JSON file exists
        const jsonExists = existingImages.some(img => img.fileName === jsonFileName);
        
        if (jsonExists) {
          if (!confirm(`JSON file "${jsonFileName}" already exists. Overwrite?`)) {
            // Skip JSON creation but count the image as saved
            savedCount++;
            continue;
          }
        }
        
        // Create FormData for the JSON file
        const jsonFormData = new FormData();
        const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
        const jsonFile = new File([jsonBlob], jsonFileName, { type: 'application/json' });
        
        jsonFormData.append('file', jsonFile);
        jsonFormData.append('path', jsonFilePath);
        
        console.log("Sending JSON file:", jsonFileName, "to path:", jsonFilePath);
        
        // Save the JSON file
        const jsonResponse = await fetch('/api/save-file', {
          method: 'POST',
          body: jsonFormData
        });
        
        if (!jsonResponse.ok) {
          const errorText = await jsonResponse.text();
          console.error("Error response from server:", errorText);
          throw new Error(`Server returned ${jsonResponse.status}: ${jsonResponse.statusText}`);
        }
        
        console.log("JSON wrapper saved successfully");
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
    alert(`All ${savedCount} images saved successfully!`);
  }
  
  // Reset metadata fields
  imageTitle.value = '';
  imageDescription.value = '';
  imageAltText.value = '';
  
  // Reload images from directory
  await loadImagesFromDirectory();
}

// Dialog functions
function openDialog() {
  confirmationDialog.style.display = 'flex';
}

function closeDialog() {
  confirmationDialog.style.display = 'none';
  dialogCallback = null;
}

// Open dialog for creating a new directory
function openNewDirectoryDialog() {
  newDirectoryNameInput.value = '';
  newDirectoryDialog.style.display = 'flex';
}

// Close the new directory dialog
function closeNewDirectoryDialog() {
  newDirectoryDialog.style.display = 'none';
}

// Show error message
function showErrorMessage(message) {
  alert(message);
} 