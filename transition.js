// transition.js - Handles smooth rotation transitions for the carousel

document.addEventListener('DOMContentLoaded', () => {
    // Reference to the directory chooser dropdown
    const chooser = document.getElementById('directory-chooser');
    const rotateButton = document.getElementById('rotate-button');
    
    // Store the current k value for reference during transitions
    let currentK = 0;
    let isRotating = false;
    let rotationAnimationId = null;
    let lastTimestamp = 0;
    const ROTATION_SPEED = 0.5; // Rotations per second
    const SNAP_THRESHOLD = 0.02; // How close to a whole number before we snap
    
    // Create a logging container to display information
    const createLogDisplay = () => {
        const logContainer = document.createElement('div');
        logContainer.id = 'transition-log';
        logContainer.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            max-width: 500px;
            max-height: 300px;
            overflow-y: auto;
            z-index: 1000;
        `;
        document.body.appendChild(logContainer);
        return logContainer;
    };
    
    // Function to log transition data
    const logDisplay = createLogDisplay();
    function logTransition(message) {
        console.log(message);
        const entry = document.createElement('div');
        entry.textContent = message;
        logDisplay.appendChild(entry);
        
        // Keep only the last 20 log entries
        while (logDisplay.children.length > 20) {
            logDisplay.removeChild(logDisplay.firstChild);
        }
        
        // Auto-scroll to the bottom
        logDisplay.scrollTop = logDisplay.scrollHeight;
    }
    
    // Clear log on click
    logDisplay.addEventListener('click', () => {
        logDisplay.innerHTML = '';
    });

    // Function to smoothly snap k to nearest valid position
    function smoothSnapK(k) {
        const fractionalPart = k - Math.floor(k);
        if (fractionalPart < SNAP_THRESHOLD) {
            return Math.floor(k);
        } else if (fractionalPart > 1 - SNAP_THRESHOLD) {
            return Math.ceil(k);
        }
        return k;
    }
    
    // Function to perform continuous rotation
    function rotateCarousel(timestamp) {
        if (!isRotating) return;
        
        if (!lastTimestamp) lastTimestamp = timestamp;
        const deltaTime = (timestamp - lastTimestamp) / 1000; // Convert to seconds
        lastTimestamp = timestamp;
        
        // Get the current k value
        const currentKValue = parseFloat(getComputedStyle(document.body).getPropertyValue('--k'));
        
        // Calculate new k value based on time delta and rotation speed
        let newK = currentKValue + (ROTATION_SPEED * deltaTime);
        
        // Check if we're near a whole number and should snap
        newK = smoothSnapK(newK);
        
        // Wrap k value when it exceeds 1
        if (newK >= 1) {
            newK = newK - Math.floor(newK);
        }
        
        // Update the k value
        document.body.style.setProperty('--k', newK);
        
        // Update scroll position to match k value
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPos = newK * scrollHeight;
        window.scrollTo(0, scrollPos);
        
        // Log the rotation
        if (Math.random() < 0.05) { // Log occasionally to avoid spam
            logTransition(`Rotating: k=${newK.toFixed(4)}, deltaTime=${deltaTime.toFixed(3)}s`);
        }
        
        // Continue the animation
        rotationAnimationId = requestAnimationFrame(rotateCarousel);
    }
    
    // Handle button press and release
    rotateButton.addEventListener('mousedown', () => {
        isRotating = true;
        lastTimestamp = 0; // Reset timestamp
        rotateCarousel(performance.now());
        logTransition('Rotation started');
    });
    
    // Function to smoothly stop rotation
    function stopRotation() {
        isRotating = false;
        if (rotationAnimationId) {
            cancelAnimationFrame(rotationAnimationId);
            rotationAnimationId = null;
        }
        lastTimestamp = 0;
        
        // Get final k value
        const finalK = parseFloat(getComputedStyle(document.body).getPropertyValue('--k'));
        // Snap to nearest valid position
        const snappedK = smoothSnapK(finalK);
        
        if (finalK !== snappedK) {
            logTransition(`Smoothly adjusting final position: ${finalK.toFixed(4)} → ${snappedK.toFixed(4)}`);
            document.body.style.setProperty('--k', snappedK);
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPos = snappedK * scrollHeight;
            window.scrollTo(0, scrollPos);
        }
        
        logTransition('Rotation stopped');
    }
    
    rotateButton.addEventListener('mouseup', stopRotation);
    rotateButton.addEventListener('mouseleave', () => {
        if (isRotating) {
            stopRotation();
            logTransition('Rotation stopped (mouse left button)');
        }
    });
    
    // Add event listener for the dropdown menu
    chooser.addEventListener('change', (event) => {
        // Clear previous logs
        logDisplay.innerHTML = '';
        logTransition(`Directory changed to: ${event.target.value}`);
        
        // Load the new posters
        loadPosters(event.target.value);
    });
}); 