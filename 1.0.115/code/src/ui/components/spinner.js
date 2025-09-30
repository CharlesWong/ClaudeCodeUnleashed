/**
 * Spinner Component
 * Animated loading spinner for terminal UI
 */

import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Spinner component for showing loading state
 */
export function Spinner({ label, isActive = true, color = 'cyan' }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <Box>
      <Text color={isActive ? color : 'green'}>
        {isActive ? SPINNER_FRAMES[frame] : '✓'}
      </Text>
      {label && <Text> {label}</Text>}
    </Box>
  );
}

/**
 * Progress bar component
 */
export function ProgressBar({ current, total, label, width = 30 }) {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;

  return (
    <Box flexDirection="column">
      {label && <Text dimColor>{label}</Text>}
      <Box>
        <Text>
          [{'█'.repeat(filled)}{'░'.repeat(empty)}] {percentage}%
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Activity indicator for background tasks
 */
export function ActivityIndicator({ task, status }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'pending': return '○';
      case 'running': return '◉';
      case 'completed': return '✓';
      case 'failed': return '✗';
      default: return '·';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running': return 'cyan';
      case 'completed': return 'green';
      case 'failed': return 'red';
      default: return 'gray';
    }
  };

  return (
    <Box>
      <Text color={getStatusColor()}>
        {getStatusIcon()}
      </Text>
      <Text dimColor={status === 'pending'}> {task}</Text>
    </Box>
  );
}

/**
 * Loading dots animation
 */
export function LoadingDots({ text = "Loading" }) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return <Text>{text}{'.'.repeat(dots)}</Text>;
}

/**
 * Step indicator for multi-step processes
 */
export function StepIndicator({ steps, currentStep }) {
  return (
    <Box flexDirection="column">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isPending = index > currentStep;

        return (
          <Box key={index}>
            <Text color={
              isCompleted ? 'green' :
              isCurrent ? 'cyan' :
              'gray'
            }>
              {isCompleted ? '✓' : isCurrent ? '→' : '○'}
            </Text>
            <Text dimColor={isPending}> {step}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Time elapsed component
 */
export function TimeElapsed({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const formatted = hours > 0 ?
    `${hours}h ${minutes % 60}m ${seconds % 60}s` :
    minutes > 0 ?
    `${minutes}m ${seconds % 60}s` :
    `${seconds}s`;

  return <Text dimColor>Time elapsed: {formatted}</Text>;
}