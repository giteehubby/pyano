class WebPiano {
    constructor() {
        this.audioContext = null;
        this.gainNode = null;
        this.sustainPedal = false;
        this.currentOctave = 4;
        this.volume = 0.5;
        this.activeNotes = new Map(); // 存储当前活动的音符
        this.pressedKeys = new Set(); // 存储当前按下的键
        this.audioCache = new Map(); // 音频缓存
        
        // 录制相关属性
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordStartTime = null;
        this.recordTimer = null;
        this.mixerNode = null;
        
        // 主题相关属性
        this.currentTheme = 'default';
        
        // 键盘映射 - 一个八度内的映射
        this.keyMapping = {
            // 白键映射 (A-J对应C-B)
            'KeyA': 'C',
            'KeyS': 'D', 
            'KeyD': 'E',
            'KeyF': 'F',
            'KeyG': 'G',
            'KeyH': 'A',
            'KeyJ': 'B',
            
            // 黑键映射 (W E T Y U对应半音)
            'KeyW': 'C#',
            'KeyE': 'D#',
            'KeyT': 'F#',
            'KeyY': 'G#',
            'KeyU': 'A#'
        };
        
        this.init();
    }
    
    async init() {
        try {
            // 初始化Web Audio API
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.volume;
            
            // 创建混音节点用于录制
            this.mixerNode = this.audioContext.createGain();
            this.gainNode.connect(this.mixerNode);
            this.mixerNode.connect(this.audioContext.destination);
            
            // 创建钢琴键盘
            await this.createPianoKeys();
            
            // 绑定事件
            this.bindEvents();
            
            console.log('钢琴初始化完成');
        } catch (error) {
            console.error('钢琴初始化失败:', error);
        }
    }
    
    async createPianoKeys() {
        const piano = document.getElementById('piano');
        piano.innerHTML = '';
        
        // 创建3个八度的键盘
        const octaves = [3, 4, 5];
        const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        
        octaves.forEach(octave => {
            whiteKeys.forEach(note => {
                // 创建白键
                const whiteKey = this.createKey(`${note}${octave}`, 'white');
                piano.appendChild(whiteKey);
                
                // 在适当位置添加黑键
                if (['C', 'D', 'F', 'G', 'A'].includes(note)) {
                    const blackKey = this.createKey(`${note}#${octave}`, 'black');
                    piano.appendChild(blackKey);
                }
            });
        });
    }
    
    createKey(note, type) {
        const key = document.createElement('div');
        key.className = `key ${type}`;
        key.dataset.note = note;
        key.textContent = note;
        
        // 鼠标事件
        key.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.playNote(note);
            key.classList.add('pressed');
        });
        
        key.addEventListener('mouseup', () => {
            if (!this.sustainPedal) {
                this.stopNote(note);
            }
            key.classList.remove('pressed');
        });
        
        key.addEventListener('mouseleave', () => {
            if (!this.sustainPedal) {
                this.stopNote(note);
            }
            key.classList.remove('pressed');
        });
        
        // 防止右键菜单
        key.addEventListener('contextmenu', e => e.preventDefault());
        
        return key;
    }
    
    bindEvents() {
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            const mappedNote = this.keyMapping[e.code];
            if (mappedNote) {
                if (e.repeat || this.pressedKeys.has(e.code)) return;
                e.preventDefault();
                const note = this.getFullNote(mappedNote);
                this.playNote(note);
                this.highlightKey(note, true);
                this.pressedKeys.add(e.code);
            }
        });
        
        document.addEventListener('keyup', (e) => {
            const mappedNote = this.keyMapping[e.code];
            if (!mappedNote || !this.pressedKeys.has(e.code)) return;
            e.preventDefault();
            const note = this.getFullNote(mappedNote);
            if (!this.sustainPedal) {
                this.stopNote(note);
            }
            this.highlightKey(note, false);
            this.pressedKeys.delete(e.code);
        });
        
        // 数字键盘切换八度
        document.addEventListener('keydown', (e) => {
            // 主键盘数字键
            if (e.code === 'Digit3') {
                this.setOctave(3);
            } else if (e.code === 'Digit4') {
                this.setOctave(4);
            } else if (e.code === 'Digit5') {
                this.setOctave(5);
            }
            // 数字键盘
            else if (e.code === 'Numpad3') {
                this.setOctave(3);
            } else if (e.code === 'Numpad4') {
                this.setOctave(4);
            } else if (e.code === 'Numpad5') {
                this.setOctave(5);
            }
        });
        
        // 控制面板事件
        document.getElementById('octave').addEventListener('change', (e) => {
            this.currentOctave = parseInt(e.target.value);
        });
        
        document.getElementById('volume').addEventListener('input', (e) => {
            this.volume = e.target.value / 100;
            this.gainNode.gain.value = this.volume;
            document.getElementById('volume-display').textContent = `${e.target.value}%`;
        });
        
        document.getElementById('sustain-btn').addEventListener('click', (e) => {
            this.sustainPedal = !this.sustainPedal;
            e.target.textContent = this.sustainPedal ? '延音踏板 ON' : '延音踏板 OFF';
            e.target.classList.toggle('active', this.sustainPedal);
            
            // 如果关闭延音踏板，让当前音符自然衰减而不是立即停止
            if (!this.sustainPedal) {
                this.releaseAllSustainedNotes();
            }
        });
        
        // 防止页面刷新时音频上下文被暂停
        ['pointerdown','touchstart','keydown','click'].forEach(evt => {
            document.addEventListener(evt, () => {
                if (this.audioContext && this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
            }, { once: true });
        });

        // 失焦清理
        window.addEventListener('blur', () => this.stopAllNotes());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stopAllNotes();
        });

        // 卸载释放
        window.addEventListener('beforeunload', () => {
            this.stopAllNotes();
            if (this.isRecording) {
                this.stopRecording();
            }
            this.audioContext && this.audioContext.close();
        });
        
        // 录制按钮事件
        const recordBtn = document.getElementById('record-btn');
        if (recordBtn) {
            recordBtn.addEventListener('click', () => {
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            });
        }
        
        // R键快捷键录制
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyR' && !e.repeat) {
                // 检查是否不在演奏键上，避免冲突
                if (!this.keyMapping[e.code]) {
                    e.preventDefault();
                    const recordBtn = document.getElementById('record-btn');
                    if (recordBtn) {
                        recordBtn.click();
                    }
                }
            }
        });
        
        // 主题选择器事件
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            themeSelector.addEventListener('change', (e) => {
                this.changeTheme(e.target.value);
            });
        }
        
        // 初始化主题
        this.initializeTheme();
    }
    
    getFullNote(noteBase) {
        return `${noteBase}${this.currentOctave}`;
    }
    
    setOctave(octave) {
        // 限制八度范围在3-5之间
        if (octave >= 3 && octave <= 5) {
            this.currentOctave = octave;
            // 更新UI中的八度选择器
            const octaveSelect = document.getElementById('octave');
            if (octaveSelect) {
                octaveSelect.value = octave;
            }
            console.log(`切换到第${octave}八度`);
        }
    }
    
    async playNote(note) {
        try {
            let audioBuffer = this.audioCache.get(note);
            
            if (!audioBuffer) {
                // 生成音频数据
                audioBuffer = await this.generateNoteAudio(note);
                this.audioCache.set(note, audioBuffer);
            }
            
            // 创建音频源
            const source = this.audioContext.createBufferSource();
            const noteGain = this.audioContext.createGain();
            
            source.buffer = audioBuffer;
            source.connect(noteGain);
            noteGain.connect(this.gainNode);
            
            // 设置ADSR包络 - 根据频率调整音量
            const frequency = this.noteToFrequency(note);
            let volumeMultiplier = 1.0;
            
            // 低频补偿 - 低频音需要更大音量
            if (frequency < 200) {
                volumeMultiplier = 1.5; // 第三八度及以下
            } else if (frequency < 400) {
                volumeMultiplier = 1.2; // 第四八度低部分
            }
            
            const now = this.audioContext.currentTime;
            const peakGain = 0.8 * volumeMultiplier;
            const sustainGain = 0.65 * volumeMultiplier;
            
            noteGain.gain.setValueAtTime(0, now);
            noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.05); // 攻击
            noteGain.gain.linearRampToValueAtTime(sustainGain, now + 0.25); // 衰减到持续级别
            
            // 如果不是延音踏板模式，设置自然衰减
            if (!this.sustainPedal) {
                noteGain.gain.exponentialRampToValueAtTime(sustainGain * 0.3, now + 1.5);
            }
            
            source.start(now);
            
            // 为每个音符实例创建唯一ID
            const noteId = `${note}_${Date.now()}_${Math.random()}`;
            
            // 存储活动音符
            this.activeNotes.set(noteId, { note, source, gainNode: noteGain });
            
            // 音符结束时自动清理
            source.onended = () => {
                this.activeNotes.delete(noteId);
                this.updateCurrentNotesDisplay();
            };
            
            // 更新显示
            this.updateCurrentNotesDisplay();
            
        } catch (error) {
            console.error('播放音符失败:', error);
        }
    }
    
    stopNote(note) {
        // 停止指定音符的所有实例
        const notesToStop = [];
        this.activeNotes.forEach((activeNote, noteId) => {
            if (activeNote.note === note) {
                notesToStop.push(noteId);
            }
        });
        
        notesToStop.forEach(noteId => {
            const activeNote = this.activeNotes.get(noteId);
            if (activeNote) {
                const now = this.audioContext.currentTime;
                const currentGain = activeNote.gainNode.gain.value;
                
                // 更自然的释放曲线 - 使用指数衰减
                activeNote.gainNode.gain.cancelScheduledValues(now);
                activeNote.gainNode.gain.setValueAtTime(currentGain, now);
                
                if (this.sustainPedal) {
                    // 延音踏板开启时使用更长的释放时间
                    activeNote.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
                    setTimeout(() => {
                        try {
                            activeNote.source.stop();
                        } catch (e) {
                            // 音符可能已经停止
                        }
                        this.activeNotes.delete(noteId);
                        this.updateCurrentNotesDisplay();
                    }, 1500);
                } else {
                    // 正常释放
                    activeNote.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
                    setTimeout(() => {
                        try {
                            activeNote.source.stop();
                        } catch (e) {
                            // 音符可能已经停止
                        }
                        this.activeNotes.delete(noteId);
                        this.updateCurrentNotesDisplay();
                    }, 800);
                }
            }
        });
    }
    
    stopAllNotes() {
        const allNoteIds = Array.from(this.activeNotes.keys());
        allNoteIds.forEach(noteId => {
            const activeNote = this.activeNotes.get(noteId);
            if (activeNote) {
                try {
                    activeNote.source.stop();
                } catch (e) {
                    // 音符可能已经停止
                }
                this.activeNotes.delete(noteId);
            }
        });
        this.updateCurrentNotesDisplay();
    }
    
    releaseAllSustainedNotes() {
        // 延音踏板释放时，让所有音符自然衰减
        const now = this.audioContext.currentTime;
        this.activeNotes.forEach((activeNote, noteId) => {
            const currentGain = activeNote.gainNode.gain.value;
            activeNote.gainNode.gain.cancelScheduledValues(now);
            activeNote.gainNode.gain.setValueAtTime(currentGain, now);
            activeNote.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
            
            setTimeout(() => {
                try {
                    activeNote.source.stop();
                } catch (e) {
                    // 音符可能已经停止
                }
                this.activeNotes.delete(noteId);
                this.updateCurrentNotesDisplay();
            }, 2000);
        });
    }
    
    async generateNoteAudio(note) {
        try {
            const frequency = this.noteToFrequency(note);
            const duration = 8.0; // 增加持续时间以支持延音
            const sampleRate = this.audioContext.sampleRate;
            const length = sampleRate * duration;
            
            const audioBuffer = this.audioContext.createBuffer(1, length, sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                
                // 基础正弦波 + 谐波，根据频率调整谐波强度
                const fundamental = Math.sin(2 * Math.PI * frequency * t);
                
                // 低频音需要更强的谐波来增加存在感
                let harmonicStrength = frequency < 200 ? 1.2 : 1.0;
                
                const harmonic2 = (0.5 * harmonicStrength) * Math.sin(2 * Math.PI * frequency * 2 * t);
                const harmonic3 = (0.25 * harmonicStrength) * Math.sin(2 * Math.PI * frequency * 3 * t);
                const harmonic4 = (0.125 * harmonicStrength) * Math.sin(2 * Math.PI * frequency * 4 * t);
                const harmonic5 = (0.06 * harmonicStrength) * Math.sin(2 * Math.PI * frequency * 5 * t);
                
                // 添加轻微的音色变化
                const envelope = Math.exp(-t * 0.8); // 自然衰减包络
                
                channelData[i] = (fundamental + harmonic2 + harmonic3 + harmonic4 + harmonic5) * 0.3 * envelope;
            }
            
            return audioBuffer;
        } catch (error) {
            console.error('生成音频失败:', error);
            throw error;
        }
    }
    
    noteToFrequency(note) {
        const noteMap = {
            'C': -9, 'C#': -8, 'Db': -8,
            'D': -7, 'D#': -6, 'Eb': -6,
            'E': -5,
            'F': -4, 'F#': -3, 'Gb': -3,
            'G': -2, 'G#': -1, 'Ab': -1,
            'A': 0, 'A#': 1, 'Bb': 1,
            'B': 2
        };
        
        let noteName, octave;
        if (note.length === 2) {
            noteName = note[0];
            octave = parseInt(note[1]);
        } else if (note.length === 3) {
            noteName = note.slice(0, 2);
            octave = parseInt(note[2]);
        } else {
            return 440.0;
        }
        
        const semitoneOffset = noteMap[noteName] || 0;
        const octaveOffset = (octave - 4) * 12;
        const totalOffset = semitoneOffset + octaveOffset;
        
        return 440.0 * Math.pow(2, totalOffset / 12);
    }
    
    highlightKey(note, pressed) {
        const key = document.querySelector(`[data-note="${note}"]`);
        if (key) {
            if (pressed) {
                key.classList.add('active');
            } else {
                key.classList.remove('active');
            }
        }
    }
    
    updateCurrentNotesDisplay() {
        const display = document.getElementById('current-notes-display');
        
        // 获取所有活动音符的名称并去重
        const uniqueNotes = [...new Set(Array.from(this.activeNotes.values()).map(activeNote => activeNote.note))];
        
        if (uniqueNotes.length === 0) {
            display.innerHTML = '<span style="color: #999;">无</span>';
        } else {
            display.innerHTML = uniqueNotes
                .map(note => `<span class="note-indicator">${note}</span>`)
                .join('');
        }
    }
    
    async startRecording() {
        try {
            // 创建MediaStreamDestination用于录制
            const dest = this.audioContext.createMediaStreamDestination();
            this.mixerNode.connect(dest);
            
            // 创建MediaRecorder
            this.mediaRecorder = new MediaRecorder(dest.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.recordedChunks = [];
            
            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            });
            
            this.mediaRecorder.addEventListener('stop', () => {
                this.processRecording();
            });
            
            // 开始录制
            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordStartTime = Date.now();
            
            // 更新UI
            this.updateRecordingUI();
            
            // 开始计时器
            this.startRecordTimer();
            
            console.log('开始录制');
            
            // 检查浏览器兼容性并提示用户
            this.checkFilePickerSupport();
            
        } catch (error) {
            console.error('开始录制失败:', error);
            alert('录制功能初始化失败，请检查浏览器是否支持录制功能');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // 停止计时器
            this.stopRecordTimer();
            
            // 更新UI
            this.updateRecordingUI();
            
            console.log('停止录制');
        }
    }
    
    updateRecordingUI() {
        const recordBtn = document.getElementById('record-btn');
        const recordStatus = document.getElementById('record-status');
        
        if (this.isRecording) {
            recordBtn.textContent = '⏹️ 停止录制';
            recordBtn.classList.add('recording');
            recordStatus.textContent = '录制中 (MP3)';
            recordStatus.classList.add('recording');
        } else {
            recordBtn.textContent = '🔴 开始录制';
            recordBtn.classList.remove('recording');
            recordStatus.textContent = '未录制';
            recordStatus.classList.remove('recording');
        }
    }
    
    startRecordTimer() {
        this.recordTimer = setInterval(() => {
            if (this.isRecording && this.recordStartTime) {
                const elapsed = Math.floor((Date.now() - this.recordStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const timeDisplay = document.getElementById('record-time');
                if (timeDisplay) {
                    timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }
            }
        }, 1000);
    }
    
    stopRecordTimer() {
        if (this.recordTimer) {
            clearInterval(this.recordTimer);
            this.recordTimer = null;
        }
        
        // 重置时间显示
        const timeDisplay = document.getElementById('record-time');
        if (timeDisplay) {
            timeDisplay.textContent = '00:00';
        }
    }
    
    async processRecording() {
        if (this.recordedChunks.length === 0) {
            alert('录制内容为空');
            return;
        }
        
        // 创建Blob
        const blob = new Blob(this.recordedChunks, {
            type: 'audio/webm;codecs=opus'
        });
        
        // 获取当前时间作为默认文件名
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const defaultFilename = `piano-recording-${timestamp}`;
        
        // 默认尝试保存为MP3格式
        if (typeof lamejs !== 'undefined') {
            try {
                await this.saveWithDialog(blob, defaultFilename, 'mp3');
            } catch (error) {
                console.error('MP3转换失败:', error);
                alert('MP3转换失败，将保存为WebM格式');
                await this.saveWithDialog(blob, defaultFilename, 'webm');
            }
        } else {
            // 如果没有MP3编码器，保存为WebM
            await this.saveWithDialog(blob, defaultFilename, 'webm');
        }
        
        // 清理录制数据
        this.recordedChunks = [];
    }
    
    async saveWithDialog(blob, defaultFilename, format) {
        const recordStatus = document.getElementById('record-status');
        
        try {
            let finalBlob = blob;
            
            // 如果是MP3格式，需要先转换
            if (format === 'mp3') {
                recordStatus.textContent = '正在转换MP3...';
                finalBlob = await this.convertBlobToMP3(blob);
            }
            
            const filename = `${defaultFilename}.${format}`;
            const mimeType = format === 'mp3' ? 'audio/mp3' : 'audio/webm';
            
            // 检查是否支持File System Access API
            if ('showSaveFilePicker' in window && window.isSecureContext) {
                try {
                    console.log('尝试打开文件保存对话框...');
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: `${format.toUpperCase()} 音频文件`,
                            accept: {
                                [mimeType]: [`.${format}`]
                            }
                        }],
                        excludeAcceptAllOption: false
                    });
                    
                    console.log('用户已选择保存位置，开始写入文件...');
                    const writable = await fileHandle.createWritable();
                    await writable.write(finalBlob);
                    await writable.close();
                    
                    console.log(`录制完成，文件已保存为: ${fileHandle.name}`);
                    alert(`录制完成！文件已保存到: ${fileHandle.name}`);
                    return;
                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.log('用户取消了文件保存');
                        alert('保存已取消');
                        return;
                    } else {
                        console.error('使用文件选择器保存失败:', error);
                        console.log('降级到传统下载方式');
                    }
                }
            } else {
                console.log('浏览器不支持文件选择器或不在安全上下文中，使用传统下载方式');
                if (!('showSaveFilePicker' in window)) {
                    console.log('原因：浏览器不支持 File System Access API');
                }
                if (!window.isSecureContext) {
                    console.log('原因：不在安全上下文中（需要HTTPS或localhost）');
                }
            }
            
            // 降级到传统下载方式
            this.fallbackDownload(finalBlob, filename);
            
        } catch (error) {
            console.error('保存文件失败:', error);
            alert('保存文件失败: ' + error.message);
        } finally {
            recordStatus.textContent = '未录制';
        }
    }
    
    fallbackDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        console.log(`录制完成，文件已下载为: ${filename}`);
        alert(`录制完成！文件已下载到默认下载目录: ${filename}\n\n提示：要选择保存位置，请使用支持文件选择器的浏览器（Chrome 86+）并确保在HTTPS环境下运行。`);
    }
    
    async convertBlobToMP3(blob) {
        // 将WebM转换为AudioBuffer
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        // 获取音频数据
        const channels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        
        // 转换为16位PCM
        const leftChannel = audioBuffer.getChannelData(0);
        const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
        
        const leftPCM = new Int16Array(length);
        const rightPCM = new Int16Array(length);
        
        for (let i = 0; i < length; i++) {
            leftPCM[i] = Math.max(-32768, Math.min(32767, leftChannel[i] * 32768));
            rightPCM[i] = Math.max(-32768, Math.min(32767, rightChannel[i] * 32768));
        }
        
        // 使用lamejs编码为MP3
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
        const mp3Data = [];
        
        const blockSize = 1152;
        for (let i = 0; i < length; i += blockSize) {
            const left = leftPCM.subarray(i, i + blockSize);
            const right = rightPCM.subarray(i, i + blockSize);
            const mp3buf = mp3encoder.encodeBuffer(left, right);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }
        
        const final = mp3encoder.flush();
        if (final.length > 0) {
            mp3Data.push(final);
        }
        
        // 创建并返回MP3 Blob
        return new Blob(mp3Data, { type: 'audio/mp3' });
    }
    
    checkFilePickerSupport() {
        if ('showSaveFilePicker' in window && window.isSecureContext) {
            console.log('✅ 支持文件选择器：录制完成后可以选择保存位置和文件名');
        } else {
            const reasons = [];
            if (!('showSaveFilePicker' in window)) {
                reasons.push('浏览器不支持File System Access API');
            }
            if (!window.isSecureContext) {
                reasons.push('不在安全上下文中（需要HTTPS或localhost）');
            }
            console.log(`⚠️  文件选择器不可用：${reasons.join('，')}。录制完成后将直接下载到默认目录。`);
        }
    }
    
    initializeTheme() {
        // 从本地存储中恢复主题设置
        const savedTheme = localStorage.getItem('piano-theme');
        if (savedTheme) {
            this.changeTheme(savedTheme);
            const themeSelector = document.getElementById('theme-selector');
            if (themeSelector) {
                themeSelector.value = savedTheme;
            }
        }
    }
    
    changeTheme(themeName) {
        this.currentTheme = themeName;
        
        // 更新HTML根元素的data-theme属性
        if (themeName === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', themeName);
        }
        
        // 保存到本地存储
        localStorage.setItem('piano-theme', themeName);
        
        // 添加主题切换动画效果
        document.body.style.transition = 'all 0.5s ease';
        
        console.log(`主题已切换为: ${this.getThemeDisplayName(themeName)}`);
    }
    
    getThemeDisplayName(themeName) {
        const themeNames = {
            'default': '默认蓝紫',
            'sunset': '落日橙红',
            'forest': '森林绿',
            'ocean': '海洋蓝',
            'sunset-pink': '粉色梦境',
            'dark': '暗夜模式'
        };
        return themeNames[themeName] || themeName;
    }
}

// 页面加载完成后初始化钢琴
document.addEventListener('DOMContentLoaded', () => {
    const piano = new WebPiano();
    
    // 添加一些说明文字
    console.log('🎹 网页钢琴已启动！');
    console.log('键盘映射:');
    console.log('白键: A S D F G H J (对应 C D E F G A B)');
    console.log('黑键: W E T Y U (对应 C# D# F# G# A#)');
    console.log('八度切换: 数字键 3 4 5 或数字键盘 3 4 5 (切换到第3、4、5八度)');
    console.log('录制功能: R键 或点击录制按钮 (开始/停止录制，默认MP3格式)');
    console.log('主题切换: 使用主题选择器切换6种不同颜色主题');
    
    // 检查文件选择器支持情况
    if ('showSaveFilePicker' in window && window.isSecureContext) {
        console.log('📁 文件保存：支持选择保存位置和文件名');
    } else {
        console.log('📁 文件保存：将保存到默认下载目录（需要Chrome 86+和HTTPS环境才能选择位置）');
    }
    
    console.log('可以同时按多个键演奏和弦！');
    console.log('🎨 主题设置会自动保存到本地存储中');
}); 