/**
 * Input Handler System
 * Complete keyboard input and paste handling
 * Extracted from lines 10000-10500 of original file
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';

// Platform-specific keyboard shortcuts
const getKeyboardShortcuts = () => {
  const isWindows = process.platform === 'windows';
  const isMac = process.platform === 'darwin';
  const nodeVersion = process.versions.node;

  // Tab navigation shortcut
  const tabNavigation = !isWindows ||
    (!isElectron() && semver.satisfies(nodeVersion, '>=22.17.0 <23.0.0 || >=24.2.0'))
    ? { displayText: 'shift+tab', check: (key, flags) => flags.tab && flags.shift }
    : { displayText: 'alt+m', check: (key, flags) => flags.meta && (key === 'm' || key === 'M') };

  // Image paste shortcut
  const imagePaste = isWindows
    ? { displayText: 'alt+v', check: (key, flags) => flags.meta && (key === 'v' || key === 'V') }
    : { displayText: 'ctrl+v', check: (key, flags) => flags.ctrl && (key === 'v' || key === 'V') };

  return { tabNavigation, imagePaste };
};

/**
 * Compare clipboard entries
 * Original: function VT9(arg, options)
 */
function compareClipboardEntries(entry1, entry2) {
  if (isImageEntry(entry1) && isImageEntry(entry2)) {
    return entry1.display === entry2.display &&
           compareArrays(entry1.pastedContents, entry2.pastedContents);
  }
  return entry1 === entry2;
}

/**
 * Compare arrays for equality
 * Original: function FT9
 */
function compareArrays(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;

  for (let i = 0; i < arr1.length; i++) {
    const item1 = arr1[i];
    const item2 = arr2[i];
    if (!item1 || !item2 || item1.content !== item2.content) return false;
  }

  return true;
}

/**
 * Add to input history
 * Original: function hT(arg)
 */
function addToHistory(input) {
  const settings = getLocalSettings();
  const history = getHistory();

  // Don't add duplicates
  if (history[0] && compareClipboardEntries(history[0], input)) return;

  // Add to beginning and limit size
  history.unshift(input);
  const MAX_HISTORY = 100;

  saveLocalSettings({
    ...settings,
    history: history.slice(0, MAX_HISTORY)
  });
}

/**
 * Format input with mode prefix
 * Original: function $TA(A, B)
 */
function formatInputWithMode(input, mode) {
  switch (mode) {
    case 'bash':
      return `!${input}`;
    case 'memorySelect':
      return `#${input}`;
    case 'background':
      return `&${input}`;
    default:
      return input;
  }
}

/**
 * Detect input mode from prefix
 * Original: function ww1(arg)
 */
function detectInputMode(input) {
  if (input.startsWith('!')) return 'bash';
  if (input.startsWith('#')) return 'memory';
  if (input.startsWith('&')) return 'background';
  return 'prompt';
}

/**
 * Check if character is mode trigger
 * Original: function wTA(arg)
 */
function isModeT

(char) {
  return char === '!' || char === '#' || char === '&';
}

/**
 * Create key handler map
 * Original: function qTA(arg)
 */
function createKeyHandlerMap(handlers) {
  return function(key) {
    return (new Map(handlers).get(key) ?? (() => {}))(key);
  };
}

/**
 * Main input handler component
 * Original: function qw1
 */
function useInputHandler({
  value,
  onChange,
  onSubmit,
  onExit,
  onExitMessage,
  onMessage,
  onHistoryUp,
  onHistoryDown,
  onHistoryReset,
  mask = '',
  multiline = false,
  cursorChar,
  invert,
  columns,
  onImagePaste,
  disableCursorMovementForUpDownKeys = false,
  externalOffset,
  onOffsetChange,
  inputFilter
}) {
  const offset = externalOffset;
  const setOffset = onOffsetChange;
  const textBuffer = TextBuffer.fromText(value, columns, offset);
  const [messageTimeout, setMessageTimeout] = useState(null);
  const { tabNavigation, imagePaste } = getKeyboardShortcuts();

  // Clear message timeout
  function clearMessageTimeout() {
    if (!messageTimeout) return;
    clearTimeout(messageTimeout);
    setMessageTimeout(null);
    onMessage?.(false);
  }

  // Double key handlers
  const ctrlCHandler = useDoubleKey(
    () => {
      clearMessageTimeout();
      onExitMessage?.('', 'Ctrl-C');
    },
    () => onExit?.(),
    () => {
      if (value) {
        onChange('');
        setOffset(0);
        onHistoryReset?.();
      }
    }
  );

  const escHandler = useDoubleKey(
    () => {
      clearMessageTimeout();
      onMessage?.(!!value, 'Press Escape again to clear');
    },
    () => {
      if (value) {
        if (value.trim() !== '') addToHistory(value);
        onChange('');
        setOffset(0);
        onHistoryReset?.();
      }
    }
  );

  // Clear screen handler
  function handleClearScreen() {
    if (value.trim() !== '') {
      addToHistory(value);
      onHistoryReset?.();
    }
    return TextBuffer.fromText('', columns, 0);
  }

  // Ctrl-D handler
  const ctrlDHandler = useDoubleKey(
    () => {
      if (value !== '') return;
      onExitMessage?.('', 'Ctrl-D');
    },
    () => {
      if (value !== '') return;
      onExit?.();
    }
  );

  // Delete handler
  function handleDelete() {
    clearMessageTimeout();
    if (textBuffer.text === '') {
      ctrlDHandler();
      return textBuffer;
    }
    return textBuffer.del();
  }

  // Image paste handler
  function handleImagePaste() {
    if (!onImagePaste) return;

    checkClipboardForImage().then(imageData => {
      if (imageData) {
        onImagePaste(imageData.base64, imageData.mediaType);
      } else {
        const message = `No image found in clipboard. Use ${imagePaste.displayText} to paste images.`;
        onMessage?.(true, message);
        clearMessageTimeout();
        setMessageTimeout(
          setTimeout(() => onMessage?.(false), 4000)
        );
      }
    });
  }

  // Ctrl key mappings
  const ctrlKeyMap = createKeyHandlerMap([
    ['a', () => textBuffer.startOfLine()],
    ['b', () => textBuffer.left()],
    ['c', ctrlCHandler],
    ['d', handleDelete],
    ['e', () => textBuffer.endOfLine()],
    ['f', () => textBuffer.right()],
    ['h', () => textBuffer.backspace()],
    ['k', () => textBuffer.deleteToLineEnd()],
    ['l', () => handleClearScreen()],
    ['n', () => handleDown()],
    ['p', () => handleUp()],
    ['u', () => textBuffer.deleteToLineStart()],
    ['w', () => textBuffer.deleteWordBefore()]
  ]);

  // Meta/Alt key mappings
  const metaKeyMap = createKeyHandlerMap([
    ['b', () => textBuffer.prevWord()],
    ['f', () => textBuffer.nextWord()],
    ['d', () => textBuffer.deleteWordAfter()]
  ]);

  // Handle enter/return
  function handleEnter(flags) {
    // Handle multiline with backslash
    if (multiline && textBuffer.offset > 0 && textBuffer.text[textBuffer.offset - 1] === '\\') {
      updateRenderInfo();
      return textBuffer.backspace().insert('\n');
    }

    // Handle multiline with meta key
    if (flags.meta) {
      return textBuffer.insert('\n');
    }

    // Submit
    onSubmit?.(value);
  }

  // Handle up arrow
  function handleUp() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryUp?.();
      return textBuffer;
    }

    const movedUp = textBuffer.up();
    if (!movedUp.equals(textBuffer)) return movedUp;

    if (multiline) {
      const logicalUp = textBuffer.upLogicalLine();
      if (!logicalUp.equals(textBuffer)) return logicalUp;
    }

    onHistoryUp?.();
    return textBuffer;
  }

  // Handle down arrow
  function handleDown() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryDown?.();
      return textBuffer;
    }

    const movedDown = textBuffer.down();
    if (!movedDown.equals(textBuffer)) return movedDown;

    if (multiline) {
      const logicalDown = textBuffer.downLogicalLine();
      if (!logicalDown.equals(textBuffer)) return logicalDown;
    }

    onHistoryDown?.();
    return textBuffer;
  }

  // Main key handler
  function getKeyHandler(flags) {
    switch (true) {
      case flags.escape:
        return () => {
          escHandler();
          return textBuffer;
        };
      case flags.leftArrow && (flags.ctrl || flags.meta || flags.fn):
        return () => textBuffer.prevWord();
      case flags.rightArrow && (flags.ctrl || flags.meta || flags.fn):
        return () => textBuffer.nextWord();
      case flags.backspace:
        return flags.meta ? () => textBuffer.deleteWordBefore() : () => textBuffer.backspace();
      case flags.delete:
        return flags.meta ? () => textBuffer.deleteToLineEnd() : () => textBuffer.del();
      case flags.ctrl:
        return ctrlKeyMap;
      case flags.home:
        return () => textBuffer.startOfLine();
      case flags.end:
        return () => textBuffer.endOfLine();
      case flags.pageDown:
        return () => textBuffer.endOfLine();
      case flags.pageUp:
        return () => textBuffer.startOfLine();
      case flags.meta:
        return metaKeyMap;
      case flags.return:
        return () => handleEnter(flags);
      case flags.tab:
        return () => textBuffer;
      case flags.upArrow:
        return handleUp;
      case flags.downArrow:
        return handleDown;
      case flags.leftArrow:
        return () => textBuffer.left();
      case flags.rightArrow:
        return () => textBuffer.right();
      default:
        return function(input) {
          // Handle home/end escape sequences
          switch (true) {
            case input === '\x1B[H' || input === '\x1B[1~':
              return textBuffer.startOfLine();
            case input === '\x1B[F' || input === '\x1B[4~':
              return textBuffer.endOfLine();
            default:
              // Handle mode triggers at start
              if (textBuffer.isAtStart() && isModeT

(input)) {
                return textBuffer.insert(
                  normalizeInput(input).replace(/\r/g, '\n')
                ).left();
              }
              return textBuffer.insert(
                normalizeInput(input).replace(/\r/g, '\n')
              );
          }
        };
    }
  }

  // Process input
  function processInput(input, flags) {
    // Check for image paste
    if (imagePaste.check(input, flags) && onImagePaste) {
      handleImagePaste();
      return;
    }

    // Apply input filter
    const filteredInput = inputFilter ? inputFilter(input, flags) : input;
    if (filteredInput === '' && input !== '') return;

    // Handle backspace character (0x7F)
    if (!flags.backspace && !flags.delete && input.includes('\x7F')) {
      const backspaceCount = (input.match(/\x7f/g) || []).length;
      let newBuffer = textBuffer;

      for (let i = 0; i < backspaceCount; i++) {
        newBuffer = newBuffer.backspace();
      }

      if (!textBuffer.equals(newBuffer)) {
        if (textBuffer.text !== newBuffer.text) onChange(newBuffer.text);
        setOffset(newBuffer.offset);
      }
      return;
    }

    // Get and execute handler
    const handler = getKeyHandler(flags);
    const result = handler(filteredInput);

    if (result) {
      if (!textBuffer.equals(result)) {
        if (textBuffer.text !== result.text) onChange(result.text);
        setOffset(result.offset);
      }
    }
  }

  return { processInput };
}

/**
 * Rainbow mode detection
 * Original: function Ew1(arg)
 */
function isRainbowMode(input) {
  return input.toLowerCase() === 'ultrathink';
}

/**
 * Get rainbow color for index
 * Original: function m61(arg, options = !1)
 */
function getRainbowColor(index, shimmer = false) {
  const colors = shimmer ? [
    'rainbow_red_shimmer',
    'rainbow_orange_shimmer',
    'rainbow_yellow_shimmer',
    'rainbow_green_shimmer',
    'rainbow_blue_shimmer',
    'rainbow_indigo_shimmer',
    'rainbow_violet_shimmer'
  ] : [
    'rainbow_red',
    'rainbow_orange',
    'rainbow_yellow',
    'rainbow_green',
    'rainbow_blue',
    'rainbow_indigo',
    'rainbow_violet'
  ];

  return colors[index % colors.length];
}

/**
 * Paste handler hook
 * Original: function RTA
 */
function usePasteHandler({ onPaste, onInput, onImagePaste }) {
  const [pasteState, setPasteState] = useState({ chunks: [], timeoutId: null });
  const [isPasting, setIsPasting] = useState(false);
  const inBracketedPaste = useRef(false);
  const hasTypedDuringPaste = useRef(false);
  const isMounted = useRef(true);
  const isMac = useMemo(() => process.platform === 'darwin', []);

  const PASTE_CHUNK_TIMEOUT = 50;
  const PASTE_COMPLETE_TIMEOUT = 100;
  const MAX_INSTANT_PASTE_LENGTH = 1000;

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const checkForImage = useCallback(() => {
    if (!onImagePaste || !isMounted.current) return;

    checkClipboardForImage()
      .then(imageData => {
        if (imageData && isMounted.current) {
          onImagePaste(imageData.base64, imageData.mediaType);
        }
      })
      .catch(error => {
        if (isMounted.current) {
          console.error(`Failed to check clipboard for image: ${error}`);
        }
      })
      .finally(() => {
        if (isMounted.current) {
          setIsPasting(false);
        }
      });
  }, [onImagePaste]);

  const debouncedCheckForImage = debounce(checkForImage, PASTE_CHUNK_TIMEOUT);

  const processPasteChunks = useCallback(
    timeoutId => {
      if (timeoutId) clearTimeout(timeoutId);

      return setTimeout(() => {
        setPasteState(({ chunks }) => {
          const pastedText = chunks.join('')
            .replace(/\[I$/, '')
            .replace(/\[O$/, '');

          // Check for screenshot path
          if (onImagePaste && isScreenshotPath(pastedText)) {
            const isTempScreenshot = /\/TemporaryItems\/.*screencaptureui.*\/Screenshot/i.test(pastedText);

            loadImageFromPath(pastedText).then(imageData => {
              if (imageData) {
                onImagePaste(imageData.base64, imageData.mediaType);
              } else if (isTempScreenshot && isMac) {
                debouncedCheckForImage();
              } else {
                if (onPaste) onPaste(pastedText);
                setIsPasting(false);
              }
            });

            return { chunks: [], timeoutId: null };
          }

          // Check for empty paste on Mac
          if (isMac && onImagePaste && pastedText.length === 0) {
            debouncedCheckForImage();
            return { chunks: [], timeoutId: null };
          }

          // Process text paste
          if (onPaste) onPaste(pastedText);
          setIsPasting(false);
          return { chunks: [], timeoutId: null };
        });
      }, PASTE_COMPLETE_TIMEOUT);
    },
    [debouncedCheckForImage, isMac, onImagePaste, onPaste]
  );

  const { stdin } = useStdin();

  useEffect(() => {
    if (!stdin) return;

    const handleData = data => {
      const text = data.toString();

      // Detect bracketed paste mode
      if (text.includes('\x1B[200~')) {
        setIsPasting(true);
        inBracketedPaste.current = true;
        hasTypedDuringPaste.current = false;
      }

      if (text.includes('\x1B[201~')) {
        setIsPasting(false);

        // Check for image if no typing during paste on Mac
        if (isMac && inBracketedPaste.current && !hasTypedDuringPaste.current && onImagePaste) {
          debouncedCheckForImage();
        }

        inBracketedPaste.current = false;
        hasTypedDuringPaste.current = false;
        setPasteState({ chunks: [], timeoutId: null });
      }
    };

    stdin.on('data', handleData);
    return () => {
      stdin.off('data', handleData);
      setIsPasting(false);
    };
  }, [stdin, onImagePaste, debouncedCheckForImage, isMac]);

  const wrappedOnInput = (input, flags) => {
    if (isPasting) {
      hasTypedDuringPaste.current = true;
    }

    const looksLikeScreenshot = isScreenshotPath(input);

    // Buffer input if it looks like paste
    if (onPaste && (
      input.length > MAX_INSTANT_PASTE_LENGTH ||
      pasteState.timeoutId ||
      looksLikeScreenshot ||
      isPasting
    )) {
      setPasteState(({ chunks, timeoutId }) => ({
        chunks: [...chunks, input],
        timeoutId: processPasteChunks(timeoutId)
      }));
      return;
    }

    // Process normal input
    if (onInput) onInput(input, flags);

    // Clear paste state for small inputs
    if (input.length > 10) {
      setIsPasting(false);
    }
  };

  return {
    wrappedOnInput,
    pasteState,
    isPasting
  };
}

// Helper functions (these would need proper implementation)
function isElectron() { return false; }
function getLocalSettings() { return {}; }
function saveLocalSettings(settings) { }
function getHistory() { return []; }
function isImageEntry(entry) { return false; }
function checkClipboardForImage() { return Promise.resolve(null); }
function isScreenshotPath(path) { return false; }
function loadImageFromPath(path) { return Promise.resolve(null); }
function normalizeInput(input) { return input; }
function updateRenderInfo() { }
function useStdin() { return { stdin: null }; }
function useDoubleKey(first, second, third) { return () => {}; }

class TextBuffer {
  constructor(text, columns, offset) {
    this.text = text;
    this.columns = columns;
    this.offset = offset;
  }

  static fromText(text, columns, offset) {
    return new TextBuffer(text, columns, offset);
  }

  equals(other) {
    return this.text === other.text && this.offset === other.offset;
  }

  isAtStart() { return this.offset === 0; }
  startOfLine() { return new TextBuffer(this.text, this.columns, 0); }
  endOfLine() { return new TextBuffer(this.text, this.columns, this.text.length); }
  left() { return new TextBuffer(this.text, this.columns, Math.max(0, this.offset - 1)); }
  right() { return new TextBuffer(this.text, this.columns, Math.min(this.text.length, this.offset + 1)); }
  backspace() {
    if (this.offset === 0) return this;
    return new TextBuffer(
      this.text.slice(0, this.offset - 1) + this.text.slice(this.offset),
      this.columns,
      this.offset - 1
    );
  }
  del() {
    if (this.offset >= this.text.length) return this;
    return new TextBuffer(
      this.text.slice(0, this.offset) + this.text.slice(this.offset + 1),
      this.columns,
      this.offset
    );
  }
  insert(str) {
    return new TextBuffer(
      this.text.slice(0, this.offset) + str + this.text.slice(this.offset),
      this.columns,
      this.offset + str.length
    );
  }
  deleteToLineEnd() {
    return new TextBuffer(this.text.slice(0, this.offset), this.columns, this.offset);
  }
  deleteToLineStart() {
    return new TextBuffer(this.text.slice(this.offset), this.columns, 0);
  }
  deleteWordBefore() {
    // Simplified implementation
    let pos = this.offset;
    while (pos > 0 && this.text[pos - 1] === ' ') pos--;
    while (pos > 0 && this.text[pos - 1] !== ' ') pos--;
    return new TextBuffer(
      this.text.slice(0, pos) + this.text.slice(this.offset),
      this.columns,
      pos
    );
  }
  deleteWordAfter() {
    // Simplified implementation
    let pos = this.offset;
    while (pos < this.text.length && this.text[pos] !== ' ') pos++;
    while (pos < this.text.length && this.text[pos] === ' ') pos++;
    return new TextBuffer(
      this.text.slice(0, this.offset) + this.text.slice(pos),
      this.columns,
      this.offset
    );
  }
  prevWord() {
    let pos = this.offset;
    while (pos > 0 && this.text[pos - 1] === ' ') pos--;
    while (pos > 0 && this.text[pos - 1] !== ' ') pos--;
    return new TextBuffer(this.text, this.columns, pos);
  }
  nextWord() {
    let pos = this.offset;
    while (pos < this.text.length && this.text[pos] !== ' ') pos++;
    while (pos < this.text.length && this.text[pos] === ' ') pos++;
    return new TextBuffer(this.text, this.columns, pos);
  }
  up() { return this; }
  down() { return this; }
  upLogicalLine() { return this; }
  downLogicalLine() { return this; }
}

export {
  useInputHandler,
  usePasteHandler,
  getKeyboardShortcuts,
  formatInputWithMode,
  detectInputMode,
  isModeT

,
  addToHistory,
  compareClipboardEntries,
  isRainbowMode,
  getRainbowColor,
  TextBuffer
};