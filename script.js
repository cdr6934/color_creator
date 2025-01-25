// Global variable to store the original image
let originalImage = null;

function toHex(value) {
    // Use chroma to handle the conversion and formatting
    return chroma(value, 0, 0).hex().slice(1, 3).toUpperCase();
}

function rgbToHex(r, g, b) {
    // Use chroma's built-in RGB to hex conversion
    return chroma(r, g, b).hex().toUpperCase();
}

function getComplementary(hex) {
    // Use chroma.js to handle color operations
    const color = chroma(hex);
    // Rotate hue by 180 degrees to get complementary color
    const complementary = color.set('hsl.h', (color.get('hsl.h') + 180) % 360);
    return complementary.hex().toUpperCase();
}

function rgbToHsv(r, g, b) {
    // Use chroma.js for RGB to HSV conversion
    const color = chroma(r, g, b);
    const [h, s, v] = color.hsv();
    return { h: h/360, s, v }; // Normalize h to 0-1 range to match existing code
}

function getColorScore(hsv, method) {
    // Convert HSV to chroma color object (note: hsv.h is in 0-1 range, needs to be 0-360)
    const color = chroma.hsv(hsv.h * 360, hsv.s, hsv.v);
    
    switch (method) {
        case 'vibrant':
            // Emphasize high saturation and brightness more strongly
            // Square the values to make the difference more pronounced
            const saturation = color.get('hsl.s');
            const luminance = color.luminance();
            return Math.pow(saturation, 2) * Math.pow(luminance, 2) * 2;
        case 'muted':
            // Medium saturation, any brightness
            const saturationDiff = Math.abs(color.get('hsl.s') - 0.5);
            return (1 - saturationDiff) * color.luminance();
        case 'balanced':
            // Consider hue spacing, saturation, and luminance
            const hueDiff = Math.abs(0.5 - ((color.get('hsl.h') / 360) % 1));
            return color.get('lch.c') * color.luminance() * (1 - hueDiff);
        default: // dominant
            return 1;
    }
}

function adjustSaturation(canvas, saturation) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        hsv.s = Math.min(1, Math.max(0, hsv.s * (saturation / 100)));
        
        const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

function hsvToRgb(h, s, v) {
    // Use chroma.js for HSV to RGB conversion
    const color = chroma.hsv(h * 360, s, v); // Multiply h by 360 since chroma expects 0-360
    const [r, g, b] = color.rgb();
    return {
        r: Math.round(r),
        g: Math.round(g),
        b: Math.round(b)
    };
}

// Add these helper functions near the top of your file
function showLoading() {
    const modal = document.getElementById('loadingModal');
    modal.style.display = 'flex';
}

function hideLoading() {
    const modal = document.getElementById('loadingModal');
    modal.style.display = 'none';
}

// Modify getDominantColors to use the loading modal
async function getDominantColors(image, numColors) {
    try {
        showLoading();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        
        const saturation = parseInt(document.getElementById('saturationValue').value);
        adjustSaturation(canvas, saturation);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const colorMap = new Map();
        
        // Reduce stride for more color samples
        const stride = Math.max(1, Math.floor((imageData.length / 4) / 20000));
        const method = document.getElementById('colorAlgorithm').value;
        
        for (let i = 0; i < imageData.length; i += stride * 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            
            // Use finer quantization for more color variety
            const color = chroma(r, g, b);
            const lab = color.lab();
            // Reduce quantization step from 10 to 5 for more color variety
            const quantizedLab = lab.map(v => Math.round(v / 5) * 5);
            const quantizedColor = chroma.lab(...quantizedLab);
            
            const colorKey = quantizedColor.hex();
            colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
        }
        
        const colorArray = Array.from(colorMap.entries())
            .map(([colorHex, count]) => {
                const color = chroma(colorHex);
                const hsv = color.hsv();
                return {
                    color: colorHex.toUpperCase(),
                    count,
                    hsv: { h: hsv[0]/360, s: hsv[1], v: hsv[2] }, // Normalize h to 0-1
                    score: getColorScore({ h: hsv[0]/360, s: hsv[1], v: hsv[2] }, method) * count
                };
            });

        // Modified selection process
        const selectedColors = [];
        const candidates = colorArray.sort((a, b) => b.score - a.score);
        
        // Add the first color (highest score)
        if (candidates.length > 0) {
            selectedColors.push(candidates[0]);
        }
        
        // Select remaining colors based on maximum difference
        while (selectedColors.length < numColors && candidates.length > 0) {
            let maxMinDistance = -1;
            let bestCandidateIndex = -1;
            
            // For each remaining candidate
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                // Find minimum distance to any selected color
                let minDistance = Infinity;
                
                for (const selected of selectedColors) {
                    const distance = calculateColorDistance(candidate.color, selected.color);
                    minDistance = Math.min(minDistance, distance);
                }
                
                // If this candidate has a larger minimum distance, it's more distinct
                if (minDistance > maxMinDistance) {
                    maxMinDistance = minDistance;
                    bestCandidateIndex = i;
                }
            }
            
            if (bestCandidateIndex !== -1) {
                selectedColors.push(candidates[bestCandidateIndex]);
                candidates.splice(bestCandidateIndex, 1);
            } else {
                break;
            }
        }

        return selectedColors
            .sort((a, b) => {
                if (Math.abs(a.hsv.h - b.hsv.h) > 0.01) {
                    return a.hsv.h - b.hsv.h;
                }
                if (Math.abs(a.hsv.s - b.hsv.s) > 0.01) {
                    return b.hsv.s - a.hsv.s;
                }
                return b.hsv.v - a.hsv.v;
            })
            .map(item => item.color);
    } finally {
        hideLoading();
    }
}

// Add this helper function to calculate color distance
function calculateColorDistance(color1, color2) {
    // Convert hex to Lab colors using chroma.js
    const lab1 = chroma(color1).lab();
    const lab2 = chroma(color2).lab();
    
    // Calculate Euclidean distance in Lab color space
    const deltaL = lab1[0] - lab2[0];
    const deltaA = lab1[1] - lab2[1];
    const deltaB = lab1[2] - lab2[2];
    
    return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

function displayColors(colors) {
    const palette = document.getElementById('colorPalette');
    const strip = document.getElementById('colorStrip');
    const exportButton = document.getElementById('exportProcreate');
    
    // Show export button when colors are displayed
    exportButton.style.display = 'inline-block';
    
    palette.innerHTML = '';
    strip.innerHTML = '';
    
    colors.forEach(color => {
        const colorBox = document.createElement('div');
        colorBox.className = 'color-box';
        // Ensure color is properly formatted and applied
        const validColor = color.startsWith('#') ? color : `#${color}`;
        colorBox.style.backgroundColor = validColor;
        
        const colorInfo = document.createElement('div');
        colorInfo.className = 'color-info';
        // Display the color hex code
        colorInfo.innerHTML = `<div>${validColor.toUpperCase()}</div>`;
        
        // Add click handler for copying
        colorBox.addEventListener('click', () => {
            copyToClipboard(validColor);
        });
        
        colorBox.appendChild(colorInfo);
        palette.appendChild(colorBox);
        
        // Also ensure strip segments use valid color format
        const stripSegment = document.createElement('div');
        stripSegment.className = 'color-strip-segment';
        stripSegment.style.backgroundColor = validColor;
        strip.appendChild(stripSegment);
    });
    
    // Ensure the palette and strip are visible
    palette.style.display = 'flex';
    strip.style.display = 'flex';
}

async function downloadSwatchFile(data, filename) {
    const zip = new JSZip();
    zip.file("Swatches.json", JSON.stringify(data, null, 2));
    
    const content = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: {
            level: 9
        }
    });
    
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.swatches`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Add this new function to resize images
async function resizeImage(imageData, maxWidth = 800) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = imageData;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            
            // Calculate new dimensions maintaining aspect ratio
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress image
            ctx.drawImage(img, 0, 0, width, height);
            
            // Get compressed image data
            const compressedImage = canvas.toDataURL('image/jpeg', 0.7);
            resolve(compressedImage);
        };
    });
}

function saveStateToLocalStorage(imageData = null) {
    try {
        const saveState = async () => {
            let processedImage = imageData;
            
            if (imageData) {
                // Resize image if it's new
                processedImage = await resizeImage(imageData);
            }
            
            const state = {
                image: processedImage || localStorage.getItem('savedImage'),
                imageName: document.getElementById('imageInput').value.split('\\').pop() || localStorage.getItem('savedImageName'),
                colorAlgorithm: document.getElementById('colorAlgorithm').value,
                numColors: document.getElementById('numColors').value,
                paletteName: document.getElementById('paletteName').value,
                saturation: document.getElementById('saturationValue').value,
                brightness: document.getElementById('brightnessValue').value,
                lastUpdated: new Date().toISOString()
            };
            
            try {
                localStorage.setItem('paletteGeneratorState', JSON.stringify(state));
                updateClearButtonVisibility();
            } catch (storageError) {
                if (storageError.name === 'QuotaExceededError') {
                    console.warn('localStorage quota exceeded, clearing storage and trying again');
                    localStorage.clear();
                    localStorage.setItem('paletteGeneratorState', JSON.stringify(state));
                    updateClearButtonVisibility();
                } else {
                    throw storageError;
                }
            }
        };

        // Execute the async function
        saveState().catch(e => {
            console.error('Error saving state:', e);
            showToast('Unable to save state to browser storage');
        });
    } catch (e) {
        console.error('Error in saveStateToLocalStorage:', e);
        showToast('Unable to save state to browser storage');
    }
}

function loadStateFromLocalStorage() {
    const stateStr = localStorage.getItem('paletteGeneratorState');
    if (!stateStr) return false;

    const state = JSON.parse(stateStr);
    
    if (state.image) {
        const image = document.getElementById('imagePreview');
        image.src = state.image;
        
        image.onload = async () => {
            originalImage = image;
            document.getElementById('colorAlgorithm').value = state.colorAlgorithm;
            document.getElementById('numColors').value = state.numColors;
            document.getElementById('paletteName').value = state.paletteName;
            document.getElementById('saturationValue').value = state.saturation;
            document.getElementById('brightnessValue').value = state.brightness;
            
            const colors = await getDominantColors(image, parseInt(state.numColors));
            displayColors(colors);
        };
        return true;
    }
    return false;
}

function updateClearButtonVisibility() {
    const clearButton = document.getElementById('clearImage');
    const state = localStorage.getItem('paletteGeneratorState');
    clearButton.style.display = state ? 'inline-block' : 'none';
}

function createProcreateJson(colors, paletteName) {
    return {
        "name": paletteName,
        "swatches": colors.map(color => {
            // Convert hex to RGB
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            
            // Convert RGB to HSV
            const hsv = rgbToHsv(r, g, b);
            
            return {
                "hue": hsv.h,
                "saturation": hsv.s,
                "brightness": hsv.v,
                "alpha": 1,
                "colorSpace": 0
            };
        })
    };
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${text} to clipboard!`);
    }).catch(err => {
        showToast('Failed to copy color code');
        console.error('Failed to copy:', err);
    });
}

// Add this function to load the default image
async function loadDefaultImage() {
    try {
        const response = await fetch('monet.png');
        const blob = await response.blob();
        const file = new File([blob], 'monet.png', { type: 'image/png' });
        
        // Use existing image handling logic
        const image = document.getElementById('imagePreview');
        image.src = URL.createObjectURL(file);
        
        // Save to localStorage
        const reader = new FileReader();
        reader.onload = async function(e) {
            await saveStateToLocalStorage(e.target.result);
        };
        reader.readAsDataURL(file);
        
        image.onload = async () => {
            originalImage = image;
            const numColors = parseInt(document.getElementById('numColors').value);
            const colors = await getDominantColors(image, numColors);
            displayColors(colors);
        }; 
    } catch (error) {
        console.error('Error loading default image:', error);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromLocalStorage();
    
    // Hide export button initially
    document.getElementById('exportProcreate').style.display = 'none';

    document.getElementById('exportProcreate').addEventListener('click', async () => {
        const palette = document.getElementById('colorPalette');
        if (palette.children.length === 0) {
            alert('Please generate a color palette first!');
            return;
        }

        const colors = Array.from(palette.children)
            .map(box => {
                const bgColor = window.getComputedStyle(box).backgroundColor;
                const rgb = bgColor.match(/\d+/g);
                
                if (!rgb || rgb.length !== 3) {
                    console.error('Invalid color format:', bgColor);
                    return null;
                }

                const [r, g, b] = rgb.map(n => {
                    const num = parseInt(n);
                    return isNaN(num) ? 0 : Math.min(255, Math.max(0, num));
                });

                return rgbToHex(r, g, b);
            })
            .filter(color => color && /^#[0-9A-F]{6}$/i.test(color));

        if (colors.length === 0) {
            alert('No valid colors found in the palette!');
            return;
        }

        const paletteName = document.getElementById('paletteName').value || 'My Color Palette';
        const procreateData = createProcreateJson(colors, paletteName);
        await downloadSwatchFile(procreateData, paletteName.toLowerCase().replace(/\s+/g, '_'));
    });

    document.getElementById('clearImage').addEventListener('click', () => {
        localStorage.removeItem('paletteGeneratorState');
        document.getElementById('imagePreview').src = '';
        document.getElementById('colorPalette').innerHTML = '';
        document.getElementById('colorStrip').innerHTML = '';
        
        document.getElementById('colorAlgorithm').value = 'dominant';
        document.getElementById('numColors').value = '30';
        document.getElementById('paletteName').value = 'My Color Palette';
        document.getElementById('saturationValue').value = '100';
        document.getElementById('brightnessValue').value = '100';
        
        document.getElementById('exportProcreate').style.display = 'none';
        updateClearButtonVisibility();
    });

    document.getElementById('imageInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                showLoading();
                const image = document.getElementById('imagePreview');
                image.src = URL.createObjectURL(file);
                
                try {
                    const reader = new FileReader();
                    reader.onload = async function(event) {
                        await saveStateToLocalStorage(event.target.result);
                    };
                    reader.readAsDataURL(file);
                } catch (e) {
                    console.error('Failed to save state to localStorage:', e);
                }
                
                image.onload = async () => {
                    originalImage = image;
                    const numColors = parseInt(document.getElementById('numColors').value);
                    const colors = await getDominantColors(image, numColors);
                    displayColors(colors);
                };
            } finally {
                hideLoading();
            }
        }
    });

    ['colorAlgorithm', 'numColors', 'paletteName', 'saturationValue', 'brightnessValue'].forEach(id => {
        document.getElementById(id).addEventListener('change', async () => {
            try {
                showLoading();
                saveStateToLocalStorage();
                if (originalImage) {
                    const numColors = parseInt(document.getElementById('numColors').value);
                    const colors = await getDominantColors(originalImage, numColors);
                    displayColors(colors);
                }
            } finally {
                hideLoading();
            }
        });
    });

    // Check for saved image, if none exists, load default
    const savedImage = localStorage.getItem('savedImage');
    if (!savedImage) {
        loadDefaultImage();
    }
}); 

function processImage(image) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;

    // Get saturation and brightness values
    const saturation = document.getElementById('saturationValue').value / 100;
    const brightness = document.getElementById('brightnessValue').value / 100;

    // Draw original image
    ctx.drawImage(image, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Adjust saturation and brightness
    for (let i = 0; i < data.length; i += 4) {
        const hsv = chroma.rgb(data[i], data[i + 1], data[i + 2]).hsv();
        const newColor = chroma.hsv(
            hsv[0], // hue
            hsv[1] * saturation, // saturation
            hsv[2] * brightness  // brightness
        ).rgb();

        data[i] = newColor[0];     // red
        data[i + 1] = newColor[1]; // green
        data[i + 2] = newColor[2]; // blue
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

// Add event listeners for both controls
document.getElementById('saturationValue').addEventListener('input', updatePalette);
document.getElementById('brightnessValue').addEventListener('input', updatePalette); 
