import React, { useEffect, useState } from 'react';
import API from '../../lib/api/client';
import PageTransition from "../../components/PageTransition";
import Skeleton from "../../components/Skeleton";

export default function Settings() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchUser() {
            try {
                const { data } = await API.get('/users/me');
                setUser(data);
            } catch (err) {
                console.error("Failed to load user info", err);
            } finally {
                setLoading(false);
            }
        }
        fetchUser();
    }, []);

    return (
        <PageTransition>
            <div className="space-y-8">
                <div>
                    <h2 className="text-xl font-semibold text-white">Settings</h2>
                    <p className="text-sm text-white/50">Manage your account and preferences</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-base-900/50 p-6">
                    <h3 className="text-lg font-medium text-white">Profile</h3>
                    <div className="mt-4 space-y-4">
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-white/50">
                                Full Name
                            </label>
                            <div className="mt-1 text-white">
                                {loading ? <Skeleton className="h-6 w-48" /> : (user?.full_name || 'Not set')}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-white/50">
                                Email Address
                            </label>
                            <div className="mt-1 text-white">
                                {loading ? <Skeleton className="h-6 w-64" /> : user?.email}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-white/50">
                                Account Created
                            </label>
                            <div className="mt-1 text-white">
                                {loading ? <Skeleton className="h-6 w-32" /> : (user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-')}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-base-900/50 p-6 opacity-50">
                    <h3 className="text-lg font-medium text-white">Preferences</h3>
                    <p className="mt-2 text-sm text-white/50">
                        Additional settings coming soon...
                    </p>
                </div>
            </div>
        </PageTransition>
    );
}
