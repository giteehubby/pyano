from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import numpy as np
import io
import base64
import soundfile as sf
from scipy import signal
import json

app = Flask(__name__)
CORS(app)

class PianoSynthesizer:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.duration = 1.0  # 音符持续时间
        
    def note_to_frequency(self, note):
        """将音符名称转换为频率 (Hz)"""
        # A4 = 440 Hz 作为参考
        note_map = {
            'C': -9, 'C#': -8, 'Db': -8,
            'D': -7, 'D#': -6, 'Eb': -6,
            'E': -5,
            'F': -4, 'F#': -3, 'Gb': -3,
            'G': -2, 'G#': -1, 'Ab': -1,
            'A': 0, 'A#': 1, 'Bb': 1,
            'B': 2
        }
        
        if len(note) == 2:
            note_name = note[0]
            octave = int(note[1])
        elif len(note) == 3:
            note_name = note[:2]
            octave = int(note[2])
        else:
            return 440.0
            
        # A4是第4八度的A，频率440Hz
        semitone_offset = note_map.get(note_name, 0)
        octave_offset = (octave - 4) * 12
        total_offset = semitone_offset + octave_offset
        
        frequency = 440.0 * (2 ** (total_offset / 12))
        return frequency
    
    def generate_tone(self, frequency, duration=None):
        """生成指定频率的音调"""
        if duration is None:
            duration = self.duration
            
        t = np.linspace(0, duration, int(self.sample_rate * duration), False)
        
        # 基础正弦波
        fundamental = np.sin(2 * np.pi * frequency * t)
        
        # 添加谐波以获得更丰富的音色
        harmonic2 = 0.5 * np.sin(2 * np.pi * frequency * 2 * t)
        harmonic3 = 0.25 * np.sin(2 * np.pi * frequency * 3 * t)
        harmonic4 = 0.125 * np.sin(2 * np.pi * frequency * 4 * t)
        
        # 合成音调
        tone = fundamental + harmonic2 + harmonic3 + harmonic4
        
        # 应用ADSR包络（攻击、衰减、持续、释放）
        attack_time = 0.1
        decay_time = 0.2
        sustain_level = 0.7
        release_time = 0.3
        
        attack_samples = int(attack_time * self.sample_rate)
        decay_samples = int(decay_time * self.sample_rate)
        release_samples = int(release_time * self.sample_rate)
        sustain_samples = len(tone) - attack_samples - decay_samples - release_samples
        
        if sustain_samples < 0:
            sustain_samples = 0
            
        envelope = np.ones_like(tone)
        
        # 攻击阶段
        if attack_samples > 0:
            envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
        
        # 衰减阶段
        if decay_samples > 0:
            start_idx = attack_samples
            end_idx = start_idx + decay_samples
            envelope[start_idx:end_idx] = np.linspace(1, sustain_level, decay_samples)
        
        # 持续阶段
        if sustain_samples > 0:
            start_idx = attack_samples + decay_samples
            end_idx = start_idx + sustain_samples
            envelope[start_idx:end_idx] = sustain_level
        
        # 释放阶段
        if release_samples > 0:
            start_idx = len(tone) - release_samples
            envelope[start_idx:] = np.linspace(sustain_level, 0, release_samples)
        
        # 应用包络
        tone *= envelope
        
        # 归一化
        tone = tone / np.max(np.abs(tone)) * 0.5
        
        return tone
    
    def audio_to_base64(self, audio_data):
        """将音频数据转换为base64编码的WAV格式"""
        buffer = io.BytesIO()
        sf.write(buffer, audio_data, self.sample_rate, format='WAV')
        buffer.seek(0)
        audio_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        return f"data:audio/wav;base64,{audio_base64}"

synthesizer = PianoSynthesizer()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate_note', methods=['POST'])
def generate_note():
    try:
        data = request.get_json()
        note = data.get('note')
        duration = data.get('duration', 1.0)
        
        frequency = synthesizer.note_to_frequency(note)
        audio_data = synthesizer.generate_tone(frequency, duration)
        audio_base64 = synthesizer.audio_to_base64(audio_data)
        
        return jsonify({
            'success': True,
            'audio': audio_base64,
            'note': note,
            'frequency': frequency
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/get_piano_keys')
def get_piano_keys():
    """返回钢琴键盘布局信息"""
    keys = []
    
    # 定义3个八度的键盘布局
    octaves = [3, 4, 5]
    white_keys = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
    black_keys = ['C#', 'D#', 'F#', 'G#', 'A#']
    
    for octave in octaves:
        for note in white_keys:
            keys.append({
                'note': f'{note}{octave}',
                'type': 'white',
                'frequency': synthesizer.note_to_frequency(f'{note}{octave}')
            })
            # 在适当位置添加黑键
            if note in ['C', 'D', 'F', 'G', 'A']:
                black_note = f'{note}#{octave}'
                keys.append({
                    'note': black_note,
                    'type': 'black',
                    'frequency': synthesizer.note_to_frequency(black_note)
                })
    
    return jsonify(keys)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 