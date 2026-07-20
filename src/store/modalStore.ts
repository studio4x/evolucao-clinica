import { create } from 'zustand';

export interface ModalOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'info' | 'danger' | 'warning' | 'success';
  icon?: 'info' | 'question' | 'warning' | 'success' | 'shield' | 'download' | 'copy' | 'trash' | 'check';
  defaultValue?: string;
  placeholder?: string;
}

interface ModalState {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'prompt' | null;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'info' | 'danger' | 'warning' | 'success';
  icon: 'info' | 'question' | 'warning' | 'success' | 'shield' | 'download' | 'copy' | 'trash' | 'check';
  defaultValue: string;
  placeholder: string;
  inputValue: string;
  setInputValue: (val: string) => void;
  resolve: ((value: any) => void) | null;
  
  showAlert: (message: string, options?: ModalOptions) => Promise<boolean>;
  showConfirm: (message: string, options?: ModalOptions) => Promise<boolean>;
  showPrompt: (message: string, options?: ModalOptions) => Promise<string | null>;
  close: (result: any) => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
  isOpen: false,
  type: null,
  title: '',
  message: '',
  confirmLabel: 'OK',
  cancelLabel: 'Cancelar',
  variant: 'info',
  icon: 'info',
  defaultValue: '',
  placeholder: '',
  inputValue: '',
  setInputValue: (inputValue) => set({ inputValue }),
  resolve: null,

  showAlert: (message, options) => {
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        type: 'alert',
        title: options?.title || 'Aviso',
        message,
        confirmLabel: options?.confirmLabel || 'OK',
        cancelLabel: '',
        variant: options?.variant || 'info',
        icon: options?.icon || 'info',
        resolve,
      });
    });
  },

  showConfirm: (message, options) => {
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        type: 'confirm',
        title: options?.title || 'Confirmação',
        message,
        confirmLabel: options?.confirmLabel || 'Confirmar',
        cancelLabel: options?.cancelLabel || 'Cancelar',
        variant: options?.variant || 'info',
        icon: options?.icon || 'question',
        resolve,
      });
    });
  },

  showPrompt: (message, options) => {
    return new Promise<string | null>((resolve) => {
      set({
        isOpen: true,
        type: 'prompt',
        title: options?.title || 'Entrada',
        message,
        confirmLabel: options?.confirmLabel || 'Confirmar',
        cancelLabel: options?.cancelLabel || 'Cancelar',
        variant: options?.variant || 'info',
        icon: options?.icon || 'question',
        defaultValue: options?.defaultValue || '',
        placeholder: options?.placeholder || '',
        inputValue: options?.defaultValue || '',
        resolve,
      });
    });
  },

  close: (result) => {
    const { resolve, type, inputValue } = get();
    if (resolve) {
      if (type === 'prompt') {
        resolve(result ? inputValue : null);
      } else {
        resolve(result);
      }
    }
    set({
      isOpen: false,
      type: null,
      title: '',
      message: '',
      confirmLabel: 'OK',
      cancelLabel: 'Cancelar',
      variant: 'info',
      icon: 'info',
      defaultValue: '',
      placeholder: '',
      inputValue: '',
      resolve: null,
    });
  },
}));

export const showAlert = (message: string, options?: ModalOptions) => 
  useModalStore.getState().showAlert(message, options);

export const showConfirm = (message: string, options?: ModalOptions) => 
  useModalStore.getState().showConfirm(message, options);

export const showPrompt = (message: string, options?: ModalOptions) => 
  useModalStore.getState().showPrompt(message, options);
