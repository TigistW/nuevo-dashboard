
import React from 'react';

export const COLORS = {
  primary: '#10b981', // Emerald 500
  secondary: '#3b82f6', // Blue 500
  warning: '#f59e0b', // Amber 500
  danger: '#ef4444', // Red 500
  background: '#0f172a', // Slate 900
  card: '#1e293b', // Slate 800
};

export const INITIAL_ACCOUNTS: any[] = [
  { id: '1', email: 'farm01@gmail.com', status: 'Free', currentTask: null, gpuType: 'A100', runningTime: '0h', lastActivity: '2 mins ago' },
  { id: '2', email: 'farm02@gmail.com', status: 'Busy', currentTask: 'T-1002', gpuType: 'T4', runningTime: '2h 15m', lastActivity: 'Just now' },
  { id: '3', email: 'farm03@gmail.com', status: 'Busy', currentTask: 'T-1003', gpuType: 'L4', runningTime: '1h 05m', lastActivity: '5 mins ago' },
  { id: '4', email: 'farm04@gmail.com', status: 'Disconnected', currentTask: null, gpuType: 'None', runningTime: '0h', lastActivity: '1 day ago' },
  { id: '5', email: 'farm05@gmail.com', status: 'Free', currentTask: null, gpuType: 'V100', runningTime: '0h', lastActivity: '10 mins ago' },
];

export const INITIAL_TASKS: any[] = [
  { id: 'T-1002', type: 'Stable Diffusion', accountAssigned: 'farm02@gmail.com', priority: 'High', estimatedTime: '15m', progress: 45, status: 'Processing', createdAt: '2024-05-20T10:00:00Z' },
  { id: 'T-1003', type: 'LLM Inference', accountAssigned: 'farm03@gmail.com', priority: 'Critical', estimatedTime: '45m', progress: 12, status: 'Processing', createdAt: '2024-05-20T10:05:00Z' },
  { id: 'T-1004', type: 'Model Training', accountAssigned: null, priority: 'Medium', estimatedTime: '2h', progress: 0, status: 'Pending', createdAt: '2024-05-20T10:10:00Z' },
];
