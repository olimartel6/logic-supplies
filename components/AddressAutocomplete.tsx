'use client';
import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

declare global {
  interface Window {
    google: any;
    initGoogleMaps: () => void;
  }
}

let scriptLoaded = false;
let scriptLoading = false;
const callbacks: (() => void)[] = [];

function loadGoogleMaps(apiKey: string, onReady: () => void) {
  if (scriptLoaded) { onReady(); return; }
  callbacks.push(onReady);
  if (scriptLoading) return;
  scriptLoading = true;
  window.initGoogleMaps = () => {
    scriptLoaded = true;
    callbacks.forEach(cb => cb());
    callbacks.length = 0;
  };
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps&loading=async`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export default function AddressAutocomplete({ value, onChange, placeholder = 'Adresse', className = '' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    if (!apiKey || !inputRef.current) return;

    function initAutocomplete() {
      if (!inputRef.current || autocompleteRef.current) return;
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'ca' },
        fields: ['formatted_address'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place.formatted_address) {
          onChange(place.formatted_address);
        }
      });
      autocompleteRef.current = ac;
    }

    loadGoogleMaps(apiKey, initAutocomplete);
  }, [apiKey, onChange]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  );
}
