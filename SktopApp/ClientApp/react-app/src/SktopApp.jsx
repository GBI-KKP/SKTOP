import React from 'react';
import CustomerPortal from './CustomerPortal.jsx';
import AdminPortal from './AdminPortal.jsx';

export default function SktopApp(props) {
    const auth = props?.auth || {};
    const isAdmin = String(auth?.role || '').toLowerCase() === 'admin';

    if (isAdmin) {
        return <AdminPortal {...props} />;
    }

    return <CustomerPortal {...props} />;
}
