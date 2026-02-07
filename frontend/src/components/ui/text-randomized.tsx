'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useReducedMotion } from 'motion/react';

const lettersAndSymbols = 'abcdefghijklmnopqrstuvwxyz!@#$%^&*-_+=;:<>,';

interface AnimatedTextProps {
  text: string;
}

export function RandomizedTextEffect({ text }: AnimatedTextProps) {
  const [animatedText, setAnimatedText] = useState('');
  const prefersReducedMotion = useReducedMotion();

  const getRandomChar = useCallback(
    () =>
      lettersAndSymbols[Math.floor(Math.random() * lettersAndSymbols.length)],
    []
  );

  const animateText = useCallback(async () => {
    if (prefersReducedMotion) {
      setAnimatedText(text);
      return;
    }

    const duration = 50;
    const revealDuration = 80;
    const initialRandomDuration = 300;

    const generateRandomText = () =>
      text
        .split('')
        .map(() => getRandomChar())
        .join('');

    setAnimatedText(generateRandomText());

    const endTime = Date.now() + initialRandomDuration;
    while (Date.now() < endTime) {
      await new Promise((resolve) => setTimeout(resolve, duration));
      setAnimatedText(generateRandomText());
    }

    for (let i = 0; i < text.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, revealDuration));
      setAnimatedText(
        (prevText) =>
          text.slice(0, i + 1) +
          prevText
            .slice(i + 1)
            .split('')
            .map(() => getRandomChar())
            .join('')
      );
    }
  }, [text, getRandomChar, prefersReducedMotion]);

  useEffect(() => {
    animateText();
  }, [text, animateText]);

  return <div className='relative inline-block'>{animatedText}</div>;
}
