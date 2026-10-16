import { speechLanguage, stripForSpeech } from '../voice/speech';
import { voiceLocale } from '../voice/recognition';

describe('speech helpers', () => {
  it('strips markdown, links and code for TTS', () => {
    expect(stripForSpeech('**Done!** See [docs](https://x.y) and `npm test`\n- item')).toBe('Done! See docs and npm test item');
    expect(stripForSpeech('```js\nconsole.log(1)\n```')).toBe('(code omitted)');
  });
  it('speaks Devanagari in Hindi regardless of preference', () => {
    expect(speechLanguage('नमस्ते, आज आपका दिन कैसा है?', 'en')).toBe('hi-IN');
    expect(speechLanguage('Kal 9 baje meeting hai', 'hinglish')).toBe('en-IN');
    expect(voiceLocale('fr')).toBe('fr-FR');
  });
});
