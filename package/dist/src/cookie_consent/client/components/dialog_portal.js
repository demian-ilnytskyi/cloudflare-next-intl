'use client';
import { createPortal } from 'react-dom';
export default function DialogPortal({ children }) {
    return createPortal(children, document.body);
}
