let originalImage = null;
let adjustmentTimeout;

 toHex = (value)  => {
    return chroma(value, 0, 0).hex().slice(1, 3).toUpperCase();
}

 rgbToHex = ( r, g, b) => {
    return chroma(r, g, b).hex().toUpperCase();
}

 getComplementary = (hex) => {
    const color = chroma(hex);
    const comp = color.set('hsl.h', (color.get('hsl.h') + 90) % 360);
    return comp.hex().toUpperCase();
}

 rgbToHsv = (r, g, b) =>  {
    const color = chroma(r, g, b);
    const [h, s, v] = color.hsv();
    return { h: h/360, s, v }; 
}

 getColorScore = (hsv, method) => {
    const color = chroma.hsv(hsv.h * 360, hsv.s, hsv.v);
    
    switch (method) {
        case 'vibrant':
            return color.saturate(2);
        case 'muted':
        
            return color.shade(0.75).saturate(2);
        case 'balanced':
            const hueDiff = Math.abs(0.5 - ((color.get('hsl.h') / 360) % 1));
            return color.get('lch.c') * color.luminance() * (1 - hueDiff);
        default:
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
    const color = chroma.hsv(h * 360, s, v);
    const [r, g, b] = color.rgb();
    return {
        r: Math.round(r),
        g: Math.round(g),
        b: Math.round(b)
    };
}

function showLoading() {
    const modal = document.getElementById('loadingModal');
    modal.style.display = 'flex';
}

function hideLoading() {
    const modal = document.getElementById('loadingModal');
    modal.style.display = 'none';
}

async function getDominantColors(image, numColors) {
    if (!document.getElementById('saturationValue').value || !document.getElementById('brightnessValue').value) {
        throw new Error('Saturation and brightness values are required');
    }

    try {
        showLoading();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        
        const saturation = parseInt(document.getElementById('saturationValue').value);
        const brightness = parseInt(document.getElementById('brightnessValue').value);
        
        // Process image with both saturation and brightness
        const processedCanvas = processImage(image);
        
        const imageData = processedCanvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const colorMap = new Map();
        const stride = Math.max(1, Math.floor((imageData.length / 4) / 20000));
        const method = document.getElementById('colorAlgorithm').value;
        
        for (let i = 0; i < imageData.length; i += stride * 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            
            const color = chroma(r, g, b);
            const lab = color.lab();
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
        const selectedColors = [];
        const candidates = colorArray.sort((a, b) => b.score - a.score);
        
        // Add the first color (highest score)
        if (candidates.length > 0) {
            selectedColors.push(candidates[0]);
        }
        
    
        while (selectedColors.length < numColors && candidates.length > 0) {
            let maxMinDistance = -1;
            let bestCandidateIndex = -1;
            
    
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                let minDistance = Infinity;
                
                for (const selected of selectedColors) {
                    const distance = calculateColorDistance(candidate.color, selected.color);
                    minDistance = Math.min(minDistance, distance);
                }
                
                
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


function calculateColorDistance(color1, color2) {

    const lab1 = chroma(color1).lab();
    const lab2 = chroma(color2).lab();
    

    const deltaL = lab1[0] - lab2[0];
    const deltaA = lab1[1] - lab2[1];
    const deltaB = lab1[2] - lab2[2];
    
    return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

function displayColors(colors) {
    const palette = document.getElementById('colorPalette');
    const strip = document.getElementById('colorStrip');
    const exportButton = document.getElementById('exportProcreate');
    const hexContainer = document.getElementById('hexCodeContainer');
    const hexList = document.getElementById('hexCodeList');
    

    exportButton.style.display = 'inline-block';
    hexContainer.style.display = 'block';
    
    palette.innerHTML = '';
    strip.innerHTML = '';
    hexList.innerHTML = '';
    

    const hexCodesArray = colors.map(color => {
        const validColor = color.startsWith('#') ? color : `#${color}`;
        return `'${validColor}'`;
    });
    
    // Add hex codes as copyable text
    hexList.innerHTML = `[${hexCodesArray.join(',\n ')}]`;
    
    colors.forEach(color => {
        const colorBox = document.createElement('div');
        colorBox.className = 'color-box';
        const validColor = color.startsWith('#') ? color : `#${color}`;
        colorBox.style.backgroundColor = validColor;
        
        const colorInfo = document.createElement('div');
        colorInfo.className = 'color-info';
        colorInfo.innerHTML = `<div>${validColor.toUpperCase()}</div>`;
        
        // Add click handler for copying
        colorBox.addEventListener('click', () => {
            copyToClipboard(validColor);
        });
        
        colorBox.appendChild(colorInfo);
        palette.appendChild(colorBox);
        
        const stripSegment = document.createElement('div');
        stripSegment.className = 'color-strip-segment';
        stripSegment.style.backgroundColor = validColor;
        strip.appendChild(stripSegment);
    });
    
    // Add click handler for copying all hex codes
    document.getElementById('copyHexCodes').addEventListener('click', () => {
        copyHexCodesToClipboard(colors);
    });
    
    // Ensure the palette and strip are visible
    palette.style.display = 'flex';
    strip.style.display = 'flex';
}

// Add new function to copy all hex codes
function copyHexCodesToClipboard(colors) {
    const hexCodes = colors.map(color => {
        return color.startsWith('#') ? color : `#${color}`;
    });
    const arrayString = `[${hexCodes.join(',\n ')}]`;
    
    navigator.clipboard.writeText(arrayString).then(() => {
        showToast('Copied all hex codes to clipboard!');
    }).catch(err => {
        showToast('Failed to copy hex codes');
        console.error('Failed to copy:', err);
    });
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

document.addEventListener('DOMContentLoaded', () => {
    loadStateFromLocalStorage();
    

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


    const saturation = document.getElementById('saturationValue').value / 100;
    const brightness = document.getElementById('brightnessValue').value / 100;

    
    ctx.drawImage(image, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;


    for (let i = 0; i < data.length; i += 4) {
        const hsv = chroma.rgb(data[i], data[i + 1], data[i + 2]).hsv();
        const newColor = chroma.hsv(
            hsv[0], // hue
            hsv[1] * saturation, 
            hsv[2] * brightness  
        ).rgb();

        data[i] = newColor[0];    
        data[i + 1] = newColor[1]; 
        data[i + 2] = newColor[2]; 
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

async function updatePalette() {
    if (!originalImage) return;
    
    try {
        showLoading();
        const numColors = parseInt(document.getElementById('numColors').value);
        const colors = await getDominantColors(originalImage, numColors);
        displayColors(colors);
        saveStateToLocalStorage();
    } finally {
        hideLoading();
    }
}

function showAdjustmentToast() {
    const toast = document.getElementById('adjustmentToast');
    toast.classList.add('show');
}

function hideAdjustmentToast() {
    const toast = document.getElementById('adjustmentToast');
    toast.classList.remove('show');
}

// Add these event listeners to your existing setup
document.getElementById('brightnessValue').addEventListener('input', function(e) {
    showAdjustmentToast();
    clearTimeout(adjustmentTimeout);
    
    adjustmentTimeout = setTimeout(() => {
        // Your existing brightness adjustment code here
        hideAdjustmentToast();
    }, 500);
});

document.getElementById('saturationValue').addEventListener('input', function(e) {
    showAdjustmentToast();
    clearTimeout(adjustmentTimeout);
    
    adjustmentTimeout = setTimeout(() => {
        // Your existing saturation adjustment code here
        hideAdjustmentToast();
    }, 500);
}); 
