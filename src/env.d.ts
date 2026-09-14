/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

type SessionRole = 'resident' | 'admin';

type Session = {
  id: string;
  role: SessionRole;
  createdAt: number;
};

declare namespace App {
  interface Locals {
    session: Session | null;
    viewAsResident: boolean;
    canEdit: boolean;
  }
}

interface Window {
  __setTheme?: (theme: 'light' | 'dark') => void;
  __toggleTheme?: () => void;
}
