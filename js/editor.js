// editor.js - Functionality for the poster editor

// DOM Elements
const directoryChooser = document.getElementById('directory-chooser');
const postersList = document.getElementById('posters-list');
const editorForm = document.getElementById('poster-editor-form');
const newPosterBtn = document.getElementById('new-poster-btn');
const deletePosterBtn = document.getElementById('delete-poster-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const addEventBtn = document.getElementById('add-event-btn');
const eventsContainer = document.getElementById('events-container');
const confirmationDialog = document.getElementById('confirmation-dialog');
const dialogConfirmBtn = document.getElementById('dialog-confirm');
const dialogCancelBtn = document.getElementById('dialog-cancel');
const dialogMessage = document.getElementById('dialog-message');
const flipPreviewBtn = document.getElementById('flip-preview-btn');
const previewContainer = document.querySelector('.preview-container');
const newDirectoryBtn = document.getElementById('new-directory-btn');
const newDirectoryDialog = document.getElementById('new-directory-dialog');
const newDirectoryNameInput = document.getElementById('new-directory-name');
const createDirectoryBtn = document.getElementById('create-directory-btn');
const cancelDirectoryBtn = document.getElementById('cancel-directory-btn');

// Form fields
const posterTitleInput = document.getElementById('poster-title');
const posterContentInput = document.getElementById('poster-content');
const epochStartInput = document.getElementById('epoch-start');
const epochEndInput = document.getElementById('epoch-end');
const posterFilenameInput = document.getElementById('poster-filename');
const posterUidInput = document.getElementById('poster-uid');

// Preview elements
const previewTitle = document.getElementById('preview-title');
const previewContent = document.getElementById('preview-content');
const previewChronology = document.getElementById('preview-chronology');

// Global variables
let currentDirectory = '';
let postersData = [];
let selectedPoster = null;
let dialogCallback = null;
let editMode = 'create'; // 'create' or 'edit'

// Initialize the editor
document.addEventListener('DOMContentLoaded', () => {
  populateDirectoryChooser();
  
  // Event listeners
  directoryChooser.addEventListener('change', loadPostersFromDirectory);
  newPosterBtn.addEventListener('click', createNewPoster);
  deletePosterBtn.addEventListener('click', confirmDeletePoster);
  cancelEditBtn.addEventListener('click', cancelEdit);
  addEventBtn.addEventListener('click', addEventInput);
  editorForm.addEventListener('submit', savePoster);
  
  // New directory related events
  newDirectoryBtn.addEventListener('click', openNewDirectoryDialog);
  createDirectoryBtn.addEventListener('click', createNewDirectory);
  cancelDirectoryBtn.addEventListener('click', closeNewDirectoryDialog);
  
  // Preview related events
  flipPreviewBtn.addEventListener('click', togglePreviewFlip);
  
  // Form input change events for real-time preview
  posterTitleInput.addEventListener('input', updatePreview);
  posterContentInput.addEventListener('input', updatePreview);
  epochStartInput.addEventListener('input', updatePreview);
  epochEndInput.addEventListener('input', updatePreview);
  
  // Dialog events
  dialogConfirmBtn.addEventListener('click', () => {
    if (dialogCallback) {
      dialogCallback();
    }
    closeDialog();
  });
  
  dialogCancelBtn.addEventListener('click', closeDialog);
  
  // Initial state
  resetForm();
});

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
    
    // Select the first option by default and load its posters
    if (directoryChooser.options.length > 0) {
      directoryChooser.selectedIndex = 0;
      loadPostersFromDirectory();
    }
  } catch (error) {
    console.error('Error loading directories:', error);
    showErrorMessage('Failed to load directories. Please try again later.');
  }
}

// Load posters from the selected directory
async function loadPostersFromDirectory() {
  currentDirectory = directoryChooser.value;
  
  try {
    // Clear existing posters list
    postersList.innerHTML = '';
    postersData = [];
    
    // Fetch posters from the selected directory
    const response = await fetch(`/api/posters?directory=${currentDirectory}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const fileList = await response.json();
    
    // Filter for JSON files
    const jsonFiles = fileList.filter(file => file.toLowerCase().endsWith('.json'));
    
    // Load data for each JSON poster
    for (const fileName of jsonFiles) {
      try {
        const filePath = `${currentDirectory}/${fileName}`;
        const posterResponse = await fetch(filePath);
        
        if (!posterResponse.ok) {
          console.warn(`Failed to load JSON poster: ${filePath}`);
          continue;
        }
        
        const posterData = await posterResponse.json();
        postersData.push({
          fileName,
          filePath,
          data: posterData
        });
        
        // Create list item for the poster
        const posterItem = document.createElement('div');
        posterItem.className = 'poster-item';
        posterItem.dataset.fileName = fileName;
        
        posterItem.innerHTML = `
          <div class="poster-item-title">${posterData.figure || 'Untitled'}</div>
          <div class="poster-item-info">${fileName}</div>
        `;
        
        posterItem.addEventListener('click', () => selectPoster(fileName));
        
        postersList.appendChild(posterItem);
      } catch (error) {
        console.error(`Error loading poster ${fileName}:`, error);
      }
    }
    
    // Reset the form and selection
    resetForm();
    selectedPoster = null;
    
  } catch (error) {
    console.error('Error loading posters:', error);
    showErrorMessage('Failed to load posters. Please try again later.');
  }
}

// Select a poster for editing
function selectPoster(fileName) {
  // Update UI for the selected poster
  document.querySelectorAll('.poster-item').forEach(item => {
    item.classList.remove('selected');
    if (item.dataset.fileName === fileName) {
      item.classList.add('selected');
    }
  });
  
  // Find the poster data
  const poster = postersData.find(p => p.fileName === fileName);
  if (poster) {
    selectedPoster = poster;
    
    // Fill the form with the poster data
    const data = poster.data;
    
    posterTitleInput.value = data.figure || '';
    posterContentInput.value = data.header || '';
    posterFilenameInput.value = fileName;
    posterUidInput.value = data.uid || '';
    
    // Chronology data
    if (data.chronology) {
      epochStartInput.value = data.chronology.epochStart || '';
      epochEndInput.value = data.chronology.epochEnd || '';
      
      // Clear existing events
      eventsContainer.innerHTML = '';
      
      // Add event inputs for each event
      if (data.chronology.epochEvents && data.chronology.epochEvents.length > 0) {
        data.chronology.epochEvents.forEach(event => {
          addEventInput(event.year, event.name);
        });
      }
    } else {
      epochStartInput.value = '';
      epochEndInput.value = '';
      eventsContainer.innerHTML = '';
    }
    
    // Update the preview
    updatePreview();
    
    // Switch to edit mode
    editMode = 'edit';
    deletePosterBtn.disabled = false;
  }
}

// Create a new poster
function createNewPoster() {
  resetForm();
  
  // Set defaults
  editMode = 'create';
  deletePosterBtn.disabled = true;
  
  // Generate a unique ID for the new poster
  posterUidInput.value = `poster-${Date.now()}`;
  
  // Remove selection from all posters
  document.querySelectorAll('.poster-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  selectedPoster = null;
  
  // Set focus on the title input
  posterTitleInput.focus();
  
  // Update the preview
  updatePreview();
}

// Reset the form
function resetForm() {
  editorForm.reset();
  eventsContainer.innerHTML = '';
  
  // Reset preview
  previewTitle.textContent = 'Poster Title';
  previewContent.innerHTML = '<p>Poster content will appear here.</p>';
  previewChronology.innerHTML = '';
  
  previewContainer.classList.remove('flipped');
}

// Cancel editing
function cancelEdit() {
  resetForm();
  
  // Remove selection from all posters
  document.querySelectorAll('.poster-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  selectedPoster = null;
  editMode = 'create';
  deletePosterBtn.disabled = true;
}

// Add an event input to the form
function addEventInput(year = '', name = '') {
  const eventGroup = document.createElement('div');
  eventGroup.className = 'event-input-group';
  
  eventGroup.innerHTML = `
    <input type="number" class="event-year" placeholder="Year" value="${year}">
    <input type="text" class="event-name" placeholder="Event description" value="${name}">
    <button type="button" class="remove-event-btn">×</button>
  `;
  
  // Add event listener to remove button
  const removeBtn = eventGroup.querySelector('.remove-event-btn');
  removeBtn.addEventListener('click', () => {
    eventGroup.remove();
    updatePreview();
  });
  
  // Add event listeners for real-time preview update
  const yearInput = eventGroup.querySelector('.event-year');
  const nameInput = eventGroup.querySelector('.event-name');
  
  yearInput.addEventListener('input', updatePreview);
  nameInput.addEventListener('input', updatePreview);
  
  eventsContainer.appendChild(eventGroup);
  
  // Update the preview when adding a new event
  updatePreview();
  
  return eventGroup;
}

// Save poster (create new or update existing)
async function savePoster(event) {
  event.preventDefault();
  
  // Collect form data
  const formData = new FormData(editorForm);
  const title = formData.get('figure');
  const content = formData.get('header');
  const epochStart = formData.get('epochStart') ? parseInt(formData.get('epochStart')) : null;
  const epochEnd = formData.get('epochEnd') ? parseInt(formData.get('epochEnd')) : null;
  const uid = formData.get('uid') || `poster-${Date.now()}`;
  
  // Collect events data
  const events = [];
  const eventGroups = eventsContainer.querySelectorAll('.event-input-group');
  
  eventGroups.forEach(group => {
    const year = group.querySelector('.event-year').value;
    const name = group.querySelector('.event-name').value;
    
    if (year && name) {
      events.push({
        year: parseInt(year),
        name: name
      });
    }
  });
  
  // Sort events by year
  events.sort((a, b) => a.year - b.year);
  
  // Create poster data object
  const posterData = {
    uid,
    header: content,
    figure: title,
    chronology: {
      epochStart,
      epochEvents: events,
      epochEnd
    }
  };
  
  try {
    // Determine filename for new posters
    let filename = formData.get('filename');
    if (!filename || editMode === 'create') {
      // Create a filename from the title
      filename = title
        .replace(/[^a-zA-Z0-9_]/g, '_') // Replace non-alphanumeric chars with underscores
        .replace(/_+/g, '_')            // Replace multiple underscores with a single one
        .replace(/^_|_$/g, '')          // Remove leading/trailing underscores
        + '.json';
    }
    
    // Get the directory to save to
    const saveDirectory = currentDirectory;
    
    // Create the full path
    const savePath = `${saveDirectory}/${filename}`;
    
    // Save the file
    const response = await fetch('/api/save-poster', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: savePath,
        data: posterData
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    // Show success message
    alert(`Poster "${title}" saved successfully!`);
    
    // Reload posters from directory
    await loadPostersFromDirectory();
    
    // Select the saved poster
    selectPoster(filename);
    
  } catch (error) {
    console.error('Error saving poster:', error);
    showErrorMessage('Failed to save poster. Please try again.');
  }
}

// Delete poster with confirmation
function confirmDeletePoster() {
  if (!selectedPoster) {
    return;
  }
  
  const posterTitle = selectedPoster.data.figure || 'Untitled';
  
  dialogMessage.textContent = `Are you sure you want to delete "${posterTitle}"? This action cannot be undone.`;
  dialogCallback = deletePoster;
  
  // Show the confirmation dialog
  openDialog();
}

// Delete the selected poster
async function deletePoster() {
  if (!selectedPoster) {
    return;
  }
  
  try {
    const response = await fetch('/api/delete-poster', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: selectedPoster.filePath
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    // Show success message
    alert(`Poster deleted successfully!`);
    
    // Reload posters from directory
    await loadPostersFromDirectory();
    
  } catch (error) {
    console.error('Error deleting poster:', error);
    showErrorMessage('Failed to delete poster. Please try again.');
  }
}

// Update the poster preview in real-time
function updatePreview() {
  // Update front side (title and chronology)
  previewTitle.textContent = posterTitleInput.value || 'Poster Title';
  
  // Update chronology
  let chronologyHTML = '';
  const start = epochStartInput.value;
  const end = epochEndInput.value;
  
  if (start && end) {
    chronologyHTML += `<div class="timeline-dates"><span class="timeline-span">${start} — ${end}</span></div>`;
  } else if (start) {
    chronologyHTML += `<div class="timeline-dates"><span class="timeline-start">${start}</span></div>`;
  } else if (end) {
    chronologyHTML += `<div class="timeline-dates"><span class="timeline-end">${end}</span></div>`;
  }
  
  // Add events
  const eventGroups = eventsContainer.querySelectorAll('.event-input-group');
  if (eventGroups.length > 0) {
    chronologyHTML += '<div class="timeline-events">';
    eventGroups.forEach(group => {
      const year = group.querySelector('.event-year').value;
      const name = group.querySelector('.event-name').value;
      
      if (year && name) {
        chronologyHTML += `<div class="event"><span class="year">${year}</span>: ${name}</div>`;
      }
    });
    chronologyHTML += '</div>';
  }
  
  previewChronology.innerHTML = chronologyHTML;
  
  // Update back side (content)
  let contentHTML = '';
  const content = posterContentInput.value;
  
  if (content) {
    if (content.includes('\n\n')) {
      const paragraphs = content.split('\n\n');
      contentHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
    } else {
      contentHTML = `<p>${content}</p>`;
    }
  } else {
    contentHTML = '<p>Poster content will appear here.</p>';
  }
  
  previewContent.innerHTML = contentHTML;
}

// Toggle preview flip
function togglePreviewFlip() {
  previewContainer.classList.toggle('flipped');
}

// Show error message
function showErrorMessage(message) {
  alert(message);
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

// Create a new directory
async function createNewDirectory() {
  const directoryName = newDirectoryNameInput.value.trim();
  
  if (!directoryName) {
    alert('Please enter a directory name');
    return;
  }
  
  try {
    // Create the request with proper headers and content type
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
    
    // Check for valid response type
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
    
    // Load posters for the new directory (which will be empty)
    loadPostersFromDirectory();
    
    // Show success message
    alert(`Category "${directoryName}" created successfully!`);
    
  } catch (error) {
    console.error('Error creating directory:', error);
    alert(`Error creating directory: ${error.message}`);
  }
} 