// export const SERVER_URL = import.meta.env.VITE_SERVER_URL || (
//   typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
//     ? `${window.location.protocol}//${window.location.hostname}:5000`
//     : 'http://localhost:5000'
// );


export const SERVER_URL = import.meta.env.VITE_SERVER_URL || (
  typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://kluff.onrender.com'
    : 'http://localhost:5000'
);