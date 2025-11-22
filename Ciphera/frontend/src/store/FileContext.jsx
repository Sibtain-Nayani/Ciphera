import React, { createContext, useContext, useState } from 'react';

const FileContext = createContext();

export function FileProvider({ children }) {
    const [fileText, setFileText] = useState('');
    const [fileName, setFileName] = useState('');

    return (
        <FileContext.Provider value={{ fileText, setFileText, fileName, setFileName }}>
            {children}
        </FileContext.Provider>
    );
}

export function useFile() {
    const context = useContext(FileContext);
    if (context === undefined) {
        throw new Error('useFile must be used within a FileProvider');
    }
    return context;
}
