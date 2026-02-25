import React from 'react';
import { useCanvasStore } from '@/store/canvasStore';
import { MousePointer2, PaintBucket, Ghost, Eraser, SquareSquare } from 'lucide-react';

export const FloatingToolbar: React.FC = () => {
    const { activeTool, setActiveTool } = useCanvasStore();

    const tools = [
        { id: 'select', icon: MousePointer2, label: 'Select & Move' },
        { id: 'draw-blackout', icon: SquareSquare, label: 'Blackout' },
        { id: 'draw-blur', icon: Ghost, label: 'Blur Region' },
        { id: 'draw-mask', icon: Eraser, label: 'White Mask' },
    ] as const;

    return (
        <div className="absolute left-6 top-6 z-50 flex flex-col gap-2 p-2 bg-[#1E1E1E]/90 backdrop-blur-md border border-[#3B3B3B] rounded-xl shadow-2xl">
            {tools.map((tool) => {
                const Icon = tool.icon;
                const isActive = activeTool === tool.id;

                return (
                    <button
                        key={tool.id}
                        onClick={() => setActiveTool(tool.id)}
                        className={`p-3 rounded-lg transition-all duration-200 group relative ${isActive
                                ? 'bg-[#FFA500] text-black shadow-[0_0_15px_rgba(255,165,0,0.3)]'
                                : 'text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
                            }`}
                        title={tool.label}
                    >
                        <Icon className="w-5 h-5" />

                        {/* Tooltip */}
                        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-[#121212] border border-[#3B3B3B] text-xs font-medium text-gray-200 rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible whitespace-nowrap z-50 transition-all duration-200">
                            {tool.label}
                        </div>
                    </button>
                );
            })}
        </div>
    );
};
