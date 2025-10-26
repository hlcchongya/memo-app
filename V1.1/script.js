let memos = [];
let currentMemoId = null;
let autoSaveTimer = null;
let db = null;
let previewTimeout = null;
let previewElement = null;

// 在 script.js 添加标签管理
let tags = []; // 全局标签列表

// 初始化标签数据库
function initTagsDatabase() {
    const transaction = db.transaction(['tags'], 'readonly');
    const objectStore = transaction.objectStore('tags');
    const request = objectStore.getAll();

    request.onsuccess = () => {
        tags = request.result || [];
        console.log('标签加载完成:', tags.length);
    };
}

// 为备忘录添加标签
function addTagToMemo(memoId, tagName) {
    const memo = memos.find(m => m.id === memoId);
    if (!memo) return;

    if (!memo.tags) {
        memo.tags = [];
    }

    if (!memo.tags.includes(tagName)) {
        memo.tags.push(tagName);
        saveMemo(memo);
        displayMemoList();
        showNotification(`✓ 已添加标签：${tagName}`, 'success');
    }
}



// 在 script.js 顶部添加历史记录栈
const historyStack = [];
const redoStack = [];
let isUndoRedo = false; // 防止撤销/重做时触发保存

// 保存历史状态
function saveHistory() {
    if (isUndoRedo) return; // 撤销/重做时不记录历史
    
    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;

    const state = {
        id: currentMemoId,
        title: memo.title,
        content: memo.content,
        timestamp: Date.now()
    };

    historyStack.push(state);
    
    // 限制历史记录数量
    if (historyStack.length > 50) {
        historyStack.shift();
    }
    
    // 清空重做栈
    redoStack.length = 0;
}

// 撤销
function undo() {
    if (historyStack.length === 0) {
        showNotification('没有可撤销的操作', 'info');
        return;
    }

    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;

    // 保存当前状态到重做栈
    redoStack.push({
        id: currentMemoId,
        title: memo.title,
        content: memo.content,
        timestamp: Date.now()
    });

    // 恢复历史状态
    const state = historyStack.pop();
    
    isUndoRedo = true;
    memo.title = state.title;
    memo.content = state.content;
    
    document.getElementById('memoTitle').value = state.title;
    renderContentWithMarkers(state.content, memo);
    
    saveMemo(memo);
    displayMemoList();
    
    isUndoRedo = false;
    
    showNotification('✓ 已撤销', 'success');
}

// 重做
function redo() {
    if (redoStack.length === 0) {
        showNotification('没有可重做的操作', 'info');
        return;
    }

    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;

    // 保存当前状态到历史栈
    historyStack.push({
        id: currentMemoId,
        title: memo.title,
        content: memo.content,
        timestamp: Date.now()
    });

    // 恢复重做状态
    const state = redoStack.pop();
    
    isUndoRedo = true;
    memo.title = state.title;
    memo.content = state.content;
    
    document.getElementById('memoTitle').value = state.title;
    renderContentWithMarkers(state.content, memo);
    
    saveMemo(memo);
    displayMemoList();
    
    isUndoRedo = false;
    
    showNotification('✓ 已重做', 'success');
}

// 在内容变化时记录历史
document.addEventListener('DOMContentLoaded', () => {
    const contentDiv = document.getElementById('memoContent');
    const titleInput = document.getElementById('memoTitle');
    
    let historyTimeout;
    
    const recordHistory = debounce(() => {
        if (!isUndoRedo) {
            saveHistory();
        }
    }, 1000);
    
    contentDiv.addEventListener('input', recordHistory);
    titleInput.addEventListener('input', recordHistory);
});

// 在 script.js 添加统计功能
function showStatistics() {
    const totalMemos = memos.length;
    const totalImages = memos.reduce((sum, memo) => sum + (memo.images?.length || 0), 0);
    const totalFiles = memos.reduce((sum, memo) => sum + (memo.files?.length || 0), 0);

    const totalSize = memos.reduce((sum, memo) => {
        let memoSize = 0;

        // 计算图片大小
        if (memo.images) {
            memoSize += memo.images.reduce((imgSum, img) => {
                const imgData = typeof img === 'string' ? img : img.data;
                return imgSum + (imgData ? imgData.length : 0);
            }, 0);
        }

        // 计算文件大小
        if (memo.files) {
            memoSize += memo.files.reduce((fileSum, file) => fileSum + (file.size || 0), 0);
        }

        return sum + memoSize;
    }, 0);

    const avgSize = totalMemos > 0 ? totalSize / totalMemos : 0;

    let modal = document.getElementById('statisticsModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'statistics-modal';
        modal.id = 'statisticsModal';
        modal.innerHTML = `
            <div class="statistics-modal-content">
                <div class="statistics-modal-header">
                    <h2>📊 数据统计</h2>
                    <button class="statistics-modal-close" onclick="closeStatisticsModal()">×</button>
                </div>
                <div class="statistics-modal-body">
                    <div class="stat-card">
                        <div class="stat-icon">📝</div>
                        <div class="stat-info">
                            <div class="stat-value">${totalMemos}</div>
                            <div class="stat-label">备忘录</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🖼️</div>
                        <div class="stat-info">
                            <div class="stat-value">${totalImages}</div>
                            <div class="stat-label">图片</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📎</div>
                        <div class="stat-info">
                            <div class="stat-value">${totalFiles}</div>
                            <div class="stat-label">文件</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">💾</div>
                        <div class="stat-info">
                            <div class="stat-value">${formatFileSize(totalSize)}</div>
                            <div class="stat-label">总占用</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📈</div>
                        <div class="stat-info">
                            <div class="stat-value">${formatFileSize(avgSize)}</div>
                            <div class="stat-label">平均大小</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeStatisticsModal();
            }
        });
    } else {
        // 更新数据
        const statValues = modal.querySelectorAll('.stat-value');
        statValues[0].textContent = totalMemos;
        statValues[1].textContent = totalImages;
        statValues[2].textContent = totalFiles;
        statValues[3].textContent = formatFileSize(totalSize);
        statValues[4].textContent = formatFileSize(avgSize);
    }

    modal.classList.add('active');
}

function closeStatisticsModal() {
    const modal = document.getElementById('statisticsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}


// 在 script.js 顶部添加数据迁移函数
function migrateAttachmentData(attachment, index, type) {
    // 旧格式：string 或 没有 tagName/fileName 的对象
    if (typeof attachment === 'string') {
        return {
            id: Date.now() + index,
            data: attachment,
            name: `${type === 'image' ? '图片' : '文件'}${index + 1}`,
            fileName: `${type === 'image' ? '图片' : '文件'}${index + 1}`,
            tagName: `${type === 'image' ? '图片' : '文件'}${index + 1}`,
            type: type,
            size: 0,
            linkedPosition: undefined,
            timestamp: Date.now()
        };
    }

    // 新格式：确保有 tagName 和 fileName
    if (!attachment.tagName) {
        attachment.tagName = attachment.name || attachment.fileName || `${type === 'image' ? '图片' : '文件'}${index + 1}`;
    }

    if (!attachment.fileName) {
        attachment.fileName = attachment.name || `${type === 'image' ? '图片' : '文件'}${index + 1}`;
    }

    return attachment;
}

// 在 script.js 顶部添加防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 优化自动保存
const debouncedSave = debounce(() => saveCurrentMemo(), 1000);

function scheduleAutoSave() {
    debouncedSave();
}

// 在 selectMemo 函数中使用
function selectMemo(id) {
    if (currentMemoId !== null) {
        saveCurrentMemoContent();
    }

    currentMemoId = id;
    const memo = memos.find(m => m.id === id);

    if (memo) {
        // ✅ 统一的数据迁移
        if (memo.images && memo.images.length > 0) {
            memo.images = memo.images.map((img, index) => migrateAttachmentData(img, index, 'image'));
        }

        if (memo.files && memo.files.length > 0) {
            memo.files = memo.files.map((file, index) => migrateAttachmentData(file, index, 'file'));
        }

        document.getElementById('memoTitle').value = memo.title;
        renderContentWithMarkers(memo.content, memo);
        document.getElementById('currentDate').textContent = memo.date;

        displayImages(memo.images || []);
        displayFiles(memo.files || []);

        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('editorArea').classList.add('active');

        const manageBtn = document.querySelector('.marker-manage-btn');
        if (manageBtn) {
            manageBtn.style.display = 'flex';
        }

        displayMemoList();
    }
}


// ========== 标记批量管理 ==========

/**
 * 切换标记管理面板
 */
function toggleMarkerManagePanel() {
    const panel = document.getElementById('markerManagePanel');
    panel.classList.toggle('hidden');
    
    if (!panel.classList.contains('hidden')) {
        updateMarkerManagePanel();
    }
}

/**
 * 更新管理面板数据
 */
function updateMarkerManagePanel() {
    const contentDiv = document.getElementById('memoContent');
    const imageMarkers = contentDiv.querySelectorAll('.attachment-marker.image');
    const fileMarkers = contentDiv.querySelectorAll('.attachment-marker.file');
    
    document.getElementById('imageMarkerCount').textContent = imageMarkers.length;
    document.getElementById('fileMarkerCount').textContent = fileMarkers.length;
    
    // 显示标记列表
    const listDiv = document.getElementById('manageMarkerList');
    listDiv.innerHTML = '';
    
    const allMarkers = [...imageMarkers, ...fileMarkers];
    allMarkers.forEach((marker, idx) => {
        const item = document.createElement('div');
        item.className = 'marker-list-item';
        
        const icon = marker.dataset.type === 'image' ? '📷' : '📎';
        const name = marker.dataset.name;
        
        item.innerHTML = `
            <span class="marker-list-icon">${icon}</span>
            <span class="marker-list-name">${name}</span>
            <button class="marker-list-locate" onclick="locateMarkerInText(${idx})">
                📍 定位
            </button>
        `;
        
        listDiv.appendChild(item);
    });
}

/**
 * 定位文本中的标记
 * @param {number} index - 标记索引
 */
function locateMarkerInText(index) {
    const contentDiv = document.getElementById('memoContent');
    const allMarkers = contentDiv.querySelectorAll('.attachment-marker');
    const marker = allMarkers[index];
    
    if (marker) {
        marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        marker.classList.add('flash');
        
        setTimeout(() => {
            marker.classList.remove('flash');
        }, 1800);
    }
}

/**
 * 重新排序标记
 */
function sortMarkers() {
    if (!confirm('将按附件类型和索引重新排序标记，是否继续？')) return;

    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;

    const contentDiv = document.getElementById('memoContent');
    const content = getPlainTextWithMarkers(contentDiv);

    // 提取所有标记
    const markers = [];
    const pattern = /\[(📷|📎)([^\]]+)\]/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
        markers.push({
            icon: match[1],
            name: match[2],
            type: match[1] === '📷' ? 'image' : 'file'
        });
    }

    if (markers.length === 0) {
        showNotification('没有标记可排序', 'info');
        return;
    }

    // 排序：图片在前，文件在后
    markers.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'image' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'zh-CN');
    });

    // ✅ 移除所有标记
    let newContent = content.replace(/\[(📷|📎)([^\]]+)\]\s?/g, '');
    newContent = newContent.replace(/\n*附件：\s*\n*/g, '');
    newContent = newContent.replace(/\n*图片：\s*\n*/g, '');
    newContent = newContent.replace(/\n*文件：\s*\n*/g, '');
    newContent = newContent.replace(/\n{3,}/g, '\n\n');
    newContent = newContent.trim();

    // ✅ 在末尾添加排序后的标记（不使用 "附件："、"图片："、"文件："）
    newContent += '\n\n';

    // 按类型分组显示
    const imageMarkers = markers.filter(m => m.type === 'image');
    const fileMarkers = markers.filter(m => m.type === 'file');

    if (imageMarkers.length > 0) {
        imageMarkers.forEach(m => {
            newContent += `[${m.icon}${m.name}] `;
        });
    }

    if (fileMarkers.length > 0) {
        if (imageMarkers.length > 0) {
            newContent += '\n';
        }
        fileMarkers.forEach(m => {
            newContent += `[${m.icon}${m.name}] `;
        });
    }

    memo.content = newContent;
    renderContentWithMarkers(newContent, memo);
    scheduleAutoSave();

    showNotification('✓ 标记已重新排序', 'success');
    updateMarkerManagePanel();
}


/**
 * 清除所有标记
 */
function removeAllMarkers() {
    if (!confirm('确定要清除所有标记吗？附件不会被删除。')) return;

    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;

    const contentDiv = document.getElementById('memoContent');

    // ✅ 直接从 DOM 中移除所有标记元素
    const markers = contentDiv.querySelectorAll('.attachment-marker');
    markers.forEach(marker => {
        // 检查标记后是否有空格
        const nextNode = marker.nextSibling;
        if (nextNode && nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent.startsWith(' ')) {
            nextNode.textContent = nextNode.textContent.substring(1);
        }
        marker.remove();
    });

    // ✅ 获取清理后的内容
    let content = getPlainTextWithMarkers(contentDiv);

    // ✅ 清理多余空行
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    memo.content = content;

    // ✅ 保存并重新渲染
    saveMemo(memo);
    renderContentWithMarkers(content, memo);

    showNotification('✓ 所有标记已清除', 'success');
    updateMarkerManagePanel();
}



/**
 * 同步标记和附件
 */
function syncMarkers() {
    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;

    const contentDiv = document.getElementById('memoContent');

    // ✅ 从 DOM 中获取所有标记
    const markerElements = contentDiv.querySelectorAll('.attachment-marker');
    const markersInText = [];

    markerElements.forEach(marker => {
        markersInText.push({
            type: marker.dataset.type,
            name: marker.dataset.name,
            index: parseInt(marker.dataset.index)
        });
    });

    // ✅ 检查孤立标记（附件已删除但标记还在）
    const orphanMarkers = [];

    markersInText.forEach(marker => {
        const attachments = marker.type === 'image' ? memo.images : memo.files;
        const exists = attachments && attachments[marker.index] &&
                      attachments[marker.index].name === marker.name;

        if (!exists) {
            orphanMarkers.push(marker);
        }
    });

    // 显示同步结果
    if (orphanMarkers.length > 0) {
        const orphanList = orphanMarkers.map(m => `${m.type === 'image' ? '📷' : '📎'} ${m.name}`).join('\n');
        const message = `发现 ${orphanMarkers.length} 个孤立标记：\n\n${orphanList}\n\n是否清理？`;

        if (confirm(message)) {
            // ✅ 移除孤立标记
            markerElements.forEach(marker => {
                const isOrphan = orphanMarkers.some(o =>
                    o.type === marker.dataset.type &&
                    o.name === marker.dataset.name &&
                    o.index === parseInt(marker.dataset.index)
                );

                if (isOrphan) {
                    // 移除后面的空格
                    const nextNode = marker.nextSibling;
                    if (nextNode && nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent.startsWith(' ')) {
                        nextNode.textContent = nextNode.textContent.substring(1);
                    }
                    marker.remove();
                }
            });

            // 保存
            const content = getPlainTextWithMarkers(contentDiv);
            memo.content = content.replace(/\n{3,}/g, '\n\n').trim();
            saveMemo(memo);
            renderContentWithMarkers(memo.content, memo);

            showNotification(`✓ 已清理 ${orphanMarkers.length} 个孤立标记`, 'success');
        }
    } else {
        const imageCount = memo.images ? memo.images.length : 0;
        const fileCount = memo.files ? memo.files.length : 0;

        showNotification(
            `✓ 同步完成\n\n` +
            `标记：${markersInText.length} 个\n` +
            `图片：${imageCount} 个\n` +
            `文件：${fileCount} 个\n\n` +
            `所有标记状态正常`,
            'success'
        );
    }

    updateMarkerManagePanel();
}




// ========== 标记右键菜单 ==========

let contextMenuElement = null;

/**
 * 显示标记右键菜单
 * @param {HTMLElement} marker - 标记元素
 * @param {Event} event - 右键事件
 */
function showMarkerContextMenu(marker, event) {
    if (contextMenuElement) {
        contextMenuElement.remove();
    }

    const type = marker.dataset.type;
    const index = parseInt(marker.dataset.index);
    const name = marker.dataset.name;

    contextMenuElement = document.createElement('div');
    contextMenuElement.className = 'marker-context-menu';
    contextMenuElement.innerHTML = `
        <div class="context-menu-item" data-action="view">
            <span class="menu-icon">👁️</span>
            <span class="menu-text">查看${type === 'image' ? '图片' : '文件'}</span>
        </div>
        <div class="context-menu-item" data-action="rename">
            <span class="menu-icon">✏️</span>
            <span class="menu-text">重命名</span>
        </div>
        <div class="context-menu-item" data-action="locate">
            <span class="menu-icon">📍</span>
            <span class="menu-text">定位附件</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="copy">
            <span class="menu-icon">📋</span>
            <span class="menu-text">复制标记</span>
        </div>
        <div class="context-menu-item" data-action="delete">
            <span class="menu-icon">🗑️</span>
            <span class="menu-text">删除标记</span>
        </div>
    `;

    contextMenuElement.style.left = event.clientX + 'px';
    contextMenuElement.style.top = event.clientY + 'px';

    document.body.appendChild(contextMenuElement);

    contextMenuElement.querySelectorAll('.context-menu-item').forEach(item => {
        item.onclick = () => {
            const action = item.dataset.action;
            handleMarkerContextAction(action, type, index, marker);
            contextMenuElement.remove();
            contextMenuElement = null;
        };
    });

    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 0);
}


/**
 * 关闭右键菜单
 */
function closeContextMenu() {
    if (contextMenuElement) {
        contextMenuElement.remove();
        contextMenuElement = null;
    }
    document.removeEventListener('click', closeContextMenu);
}

/**
 * 处理右键菜单操作
 * @param {string} action - 操作类型
 * @param {string} type - 附件类型
 * @param {number} index - 附件索引
 * @param {HTMLElement} marker - 标记元素
 */
function handleMarkerContextAction(action, type, index, marker) {
    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;
    
    switch(action) {
        case 'view':
            if (type === 'image') {
                const imgObj = memo.images[index];
                const imgData = typeof imgObj === 'string' ? imgObj : imgObj.data;
                openImageModal(imgData);
            } else {
                downloadFile(index);
            }
            break;
            
        case 'locate':
            highlightAttachment(type, index);
            break;
            
        case 'rename':
            renameMarker(marker, type, index);
            break;

        case 'copy':
            // 复制标记到剪贴板
            const name = marker.dataset.name;
            const icon = type === 'image' ? '📷' : '📎';
            const markerText = `[${icon}${name}]`;
            
            navigator.clipboard.writeText(markerText).then(() => {
                showNotification('✓ 标记已复制', 'success');
            });
            break;
            
        case 'delete':
            marker.remove();
            scheduleAutoSave();
            showNotification('✓ 标记已删除', 'success');
            break;
    }
}


function showAttachmentPreview(type, index, event) {
    previewTimeout = setTimeout(() => {
        const memo = memos.find(m => m.id === currentMemoId);
        if (!memo) return;
        
        previewElement = document.createElement('div');
        previewElement.className = 'attachment-preview';
        
        if (type === 'image') {
            const imgObj = memo.images[index];
            if (!imgObj) return;
            
            const imgData = typeof imgObj === 'string' ? imgObj : imgObj.data;
            const imgName = typeof imgObj === 'string' ? `图片${index + 1}` : imgObj.name;
            
            const img = document.createElement('img');
            img.src = imgData;
            
            const name = document.createElement('div');
            name.className = 'preview-name';
            name.textContent = imgName; // ✅ 完整文件名
            
            // ✅ 添加索引提示
            const indexInfo = document.createElement('div');
            indexInfo.style.cssText = 'font-size: 11px; color: #9ca3af; text-align: center; margin-top: 4px;';
            indexInfo.textContent = `图片 #${index + 1}`;
            
            previewElement.appendChild(img);
            previewElement.appendChild(name);
            previewElement.appendChild(indexInfo);
        } else {
            const fileObj = memo.files[index];
            if (!fileObj) return;
            
            const fileIcon = document.createElement('div');
            fileIcon.style.cssText = 'font-size: 64px; text-align: center; padding: 20px;';
            fileIcon.textContent = getFileIcon(fileObj.name);
            
            const fileName = document.createElement('div');
            fileName.className = 'preview-name';
            fileName.textContent = fileObj.name; // ✅ 完整文件名
            
            const fileSize = document.createElement('div');
            fileSize.style.cssText = 'text-align: center; font-size: 12px; color: #9ca3af; margin-top: 4px;';
            fileSize.textContent = formatFileSize(fileObj.size);
            
            // ✅ 添加索引提示
            const indexInfo = document.createElement('div');
            indexInfo.style.cssText = 'font-size: 11px; color: #9ca3af; text-align: center; margin-top: 2px;';
            indexInfo.textContent = `文件 #${index + 1}`;
            
            previewElement.appendChild(fileIcon);
            previewElement.appendChild(fileName);
            previewElement.appendChild(fileSize);
            previewElement.appendChild(indexInfo);
        }
        
        // 定位预览气泡（保持不变）
        document.body.appendChild(previewElement);
        
        const markerRect = event.target.getBoundingClientRect();
        const previewRect = previewElement.getBoundingClientRect();
        
        let left = markerRect.left + markerRect.width / 2 - previewRect.width / 2;
        let top = markerRect.top - previewRect.height - 10;
        
        if (left < 10) left = 10;
        if (left + previewRect.width > window.innerWidth - 10) {
            left = window.innerWidth - previewRect.width - 10;
        }
        if (top < 10) {
            top = markerRect.bottom + 10;
        }
        
        previewElement.style.left = left + 'px';
        previewElement.style.top = top + 'px';
    }, 300); // ✅ 减少延迟到300ms
}


/**
 * 隐藏附件预览气泡
 */
function hideAttachmentPreview() {
    clearTimeout(previewTimeout);

    if (previewElement) {
        previewElement.remove();
        previewElement = null;
    }
}

// 实时更新光标位置
document.addEventListener('DOMContentLoaded', () => {
    const contentInput = document.getElementById('memoContent');
    const titleInput = document.getElementById('memoTitle');  // ✅ 先定义

    // ✅ 然后再使用
    contentInput.addEventListener('click', () => {
        currentCursorPosition = true;
    });

    titleInput.addEventListener('click', () => {
        currentCursorPosition = null;
    });

    contentInput.addEventListener('keyup', () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            currentCursorPosition = range.startOffset;
        }
    });

    titleInput.addEventListener('keyup', () => {
        currentCursorPosition = null;
    });
});




// ========== 通用提示函数 ==========
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');

    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.success};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
        word-wrap: break-word;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, type === 'error' ? 4000 : 2000); // 错误消息显示更久
}


// ========== IndexedDB 初始化 ==========
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('MemoAppDB', 2);  

        request.onerror = () => {
            console.error('IndexedDB 打开失败:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('✓ IndexedDB 初始化成功');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // 创建备忘录存储
            if (!database.objectStoreNames.contains('memos')) {
                const objectStore = database.createObjectStore('memos', { keyPath: 'id' });
                objectStore.createIndex('created', 'created', { unique: false });
                objectStore.createIndex('date', 'date', { unique: false });
                console.log('✓ 创建备忘录存储');
            }

            // 创建历史版本存储
            if (!database.objectStoreNames.contains('versions')) {
                const versionStore = database.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
                versionStore.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('✓ 创建版本历史存储');
            }
        };

    });
}



// ========== 数据操作（IndexedDB）==========

// 从 IndexedDB 加载所有备忘录
async function loadMemos() {
    return new Promise((resolve, reject) => {
        if (!db) {
            console.error('数据库未初始化');
            resolve([]);
            return;
        }

        const transaction = db.transaction(['memos'], 'readonly');
        const objectStore = transaction.objectStore('memos');
        const request = objectStore.getAll();

        request.onsuccess = () => {
            memos = request.result || [];
            // 按创建时间降序排序
            memos.sort((a, b) => b.created - a.created);
            console.log('✓ 从 IndexedDB 加载了', memos.length, '条备忘录');
            resolve(memos);
        };

        request.onerror = () => {
            console.error('加载数据失败:', request.error);
            resolve([]);
        };
    });
}

// 保存单个备忘录到 IndexedDB
async function saveMemo(memo) {
    return new Promise((resolve, reject) => {
        if (!db) {
            console.error('数据库未初始化');
            resolve(false);
            return;
        }

        const transaction = db.transaction(['memos'], 'readwrite');
        const objectStore = transaction.objectStore('memos');
        const request = objectStore.put(memo);

        request.onsuccess = () => {
            resolve(true);
        };

        request.onerror = () => {
            console.error('保存失败:', request.error);
            showNotification('❌ 保存失败');
            resolve(false);
        };
    });
}

// 优化批量保存，使用事务
async function saveMemos() {
    return new Promise(async (resolve) => {
        if (!db || memos.length === 0) {
            console.error('数据库未初始化或无数据');
            resolve(false);
            return;
        }

        try {
            const transaction = db.transaction(['memos'], 'readwrite');
            const objectStore = transaction.objectStore('memos');

            // ✅ 先清空
            await new Promise((res, rej) => {
                const clearRequest = objectStore.clear();
                clearRequest.onsuccess = () => res();
                clearRequest.onerror = () => rej(clearRequest.error);
            });

            // ✅ 批量插入（减少事务次数）
            const promises = memos.map(memo => {
                return new Promise((res, rej) => {
                    const request = objectStore.put(memo);
                    request.onsuccess = () => res();
                    request.onerror = () => rej(request.error);
                });
            });

            await Promise.all(promises);

            transaction.oncomplete = () => {
                console.log('✓ 批量保存成功');
                resolve(true);
            };

            transaction.onerror = () => {
                console.error('批量保存失败:', transaction.error);
                resolve(false);
            };
        } catch (error) {
            console.error('保存过程出错:', error);
            resolve(false);
        }
    });
}


// 删除单个备忘录
async function deleteMemoFromDB(memoId) {
    return new Promise((resolve) => {
        if (!db) {
            resolve(false);
            return;
        }

        const transaction = db.transaction(['memos'], 'readwrite');
        const objectStore = transaction.objectStore('memos');
        const request = objectStore.delete(memoId);

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
    });
}

// 获取数据库使用情况
async function getStorageInfo() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            return {
                used: (usage / (1024 * 1024)).toFixed(2), // MB
                total: (quota / (1024 * 1024)).toFixed(2), // MB
                percentage: quota > 0 ? ((usage / quota) * 100).toFixed(1) : 0
            };
        } catch (error) {
            console.error('获取存储信息失败:', error);
            return null;
        }
    }
    return null;
}

// ========== 初始化 ==========
async function init() {
    console.log('✓ 应用初始化...');

    try {
        // 初始化 IndexedDB
        await initDatabase();

        // 加载数据
        await loadMemos();
        displayMemoList();
        updateMemoCount();

        // 显示存储使用情况
        showStorageInfo();

        // 自动保存监听
        document.getElementById('memoTitle').addEventListener('input', scheduleAutoSave);
        document.getElementById('memoContent').addEventListener('input', scheduleAutoSave);

        // 创建图片预览模态框
        createImageModal();

        console.log('✓ 应用初始化成功');
    } catch (error) {
        console.error('初始化失败:', error);
        showNotification('应用初始化失败，请刷新页面重试');
    }

}

// 显示存储使用情况
async function showStorageInfo() {
    const info = await getStorageInfo();
    if (info) {
        console.log(`📊 存储使用情况: ${info.used} MB / ${info.total} MB (${info.percentage}%)`);

        // 如果使用超过 80%，提示用户
        if (parseFloat(info.percentage) > 80) {
            showNotification(`⚠️ 存储空间使用已达 ${info.percentage}%，建议导出备份`);
        }
    }
}

// ========== 备忘录列表显示 ==========
function displayMemoList(filteredMemos = null) {
    const memoList = document.getElementById('memoList');
    const memosToDisplay = filteredMemos || memos;

    if (memosToDisplay.length === 0) {
        memoList.innerHTML = '<div style="padding: 20px; text-align: center; color: #9ca3af;">暂无备忘录</div>';
        return;
    }

    // ✅ 使用 DOM 操作替代 innerHTML 拼接
    memoList.innerHTML = ''; // 清空列表

    memosToDisplay.forEach(memo => {
        const item = document.createElement('div');
        item.className = 'memo-item';
        if (memo.id === currentMemoId) {
            item.classList.add('active');
        }
        item.onclick = () => selectMemo(memo.id);

        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete-memo-item';
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = '删除备忘录';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteMemoFromList(memo.id);
        };

        // 标题
        const titleElement = document.createElement('div');
        titleElement.className = 'memo-item-title';
        titleElement.textContent = memo.title || '无标题';

        // 预览
        const previewElement = document.createElement('div');
        previewElement.className = 'memo-item-preview';
        const contentPreview = memo.content.substring(0, 100);
        previewElement.textContent = contentPreview || '无内容';

        // 图片缩略图
        let imageContainer;
        if (memo.images && memo.images.length > 0) {
            imageContainer = document.createElement('div');
            imageContainer.className = 'memo-item-images';

            memo.images.slice(0, 3).forEach(imgObj => {
                // ✅ 兼容新旧数据格式
                const imgSrc = typeof imgObj === 'string' ? imgObj : imgObj.data;

                const imgElement = document.createElement('img');
                imgElement.src = imgSrc;
                imgElement.className = 'memo-item-thumb';
                imgElement.alt = '图片';
                imageContainer.appendChild(imgElement);
            });

            if (memo.images.length > 3) {
                const moreText = document.createElement('span');
                moreText.style.cssText = 'font-size: 12px; color: #9ca3af; line-height: 40px;';
                moreText.textContent = `+${memo.images.length - 3}`;
                imageContainer.appendChild(moreText);
            }
        }


        // 日期
        const dateElement = document.createElement('div');
        dateElement.className = 'memo-item-date';
        dateElement.textContent = memo.date;

        // 组装
        item.appendChild(deleteBtn);
        item.appendChild(titleElement);
        item.appendChild(previewElement);
        if (imageContainer) item.appendChild(imageContainer);
        item.appendChild(dateElement);

        memoList.appendChild(item);
    });

}

// ========== 备忘录操作 ==========
async function createNewMemo() {
    console.log('创建新备忘录');
    const newMemo = {
        id: Date.now(),
        title: '',
        content: '',
        images: [],
        files: [],  // ← 添加这一行
        date: formatDate(new Date()),
        created: Date.now()
    };

    memos.unshift(newMemo);
    await saveMemo(newMemo);
    selectMemo(newMemo.id);
    displayMemoList();
    updateMemoCount();

    document.getElementById('memoTitle').focus();
}


function selectMemo(id) {
    if (currentMemoId !== null) {
        saveCurrentMemoContent();
    }

    currentMemoId = id;
    const memo = memos.find(m => m.id === id);

    if (memo) {
        // 数据迁移
        if (memo.images && memo.images.length > 0) {
            memo.images = memo.images.map((img, index) => {
                if (typeof img === 'string') {
                    return {
                        id: Date.now() + index,
                        data: img,
                        name: `图片${index + 1}`,
                        type: 'image',
                        linkedPosition: undefined,
                        timestamp: Date.now()
                    };
                }
                return img;
            });
        }

        if (memo.files && memo.files.length > 0) {
            memo.files = memo.files.map((file, index) => {
                if (!file.id) {
                    file.id = Date.now() + index;
                    file.linkedPosition = undefined;
                    file.timestamp = Date.now();
                }
                return file;
            });
        }

        document.getElementById('memoTitle').value = memo.title;
        renderContentWithMarkers(memo.content, memo);
        document.getElementById('currentDate').textContent = memo.date;

        displayImages(memo.images || []);
        displayFiles(memo.files || []);

        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('editorArea').classList.add('active');

        // ✅ 显示标签管理按钮
        const manageBtn = document.querySelector('.marker-manage-btn');
        if (manageBtn) {
            manageBtn.style.display = 'flex';
        }

        displayMemoList();
    }
}


/**
 * 渲染带有可视化标记的内容
 * @param {string} content - 文本内容
 * @param {Object} memo - 备忘录对象
 */
// 修改 renderContentWithMarkers
function renderContentWithMarkers(content, memo) {
    const contentDiv = document.getElementById('memoContent');
    contentDiv.innerHTML = '';

    if (!content) return;

    const pattern = /\[(📷|📎)([^\]]+)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
        const icon = match[1];
        const tagName = match[2]; // ✅ 这是标签名
        const type = icon === '📷' ? 'image' : 'file';

        if (match.index > lastIndex) {
            const textNode = document.createTextNode(content.substring(lastIndex, match.index));
            contentDiv.appendChild(textNode);
        }

        // ✅ 根据 tagName 查找附件
        let index = -1;
        if (type === 'image' && memo.images) {
            index = memo.images.findIndex(img => {
                const name = img.tagName || img.fileName || img.name;
                return name === tagName;
            });
        } else if (type === 'file' && memo.files) {
            index = memo.files.findIndex(file => {
                const name = file.tagName || file.fileName || file.name;
                return name === tagName;
            });
        }

        if (index !== -1 && index >= 0) {
            const marker = createAttachmentMarkerElement(type, index, tagName);
            contentDiv.appendChild(marker);
        } else {
            const brokenMarker = document.createElement('span');
            brokenMarker.style.cssText = 'color: #ef4444; text-decoration: line-through;';
            brokenMarker.textContent = match[0];
            brokenMarker.title = '附件已删除';
            contentDiv.appendChild(brokenMarker);
        }

        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < content.length) {
        const textNode = document.createTextNode(content.substring(lastIndex));
        contentDiv.appendChild(textNode);
    }
}


function createAttachmentMarkerElement(type, index, name) {
    const marker = document.createElement('span');
    marker.className = `attachment-marker ${type}`;
    marker.contentEditable = 'false';
    marker.dataset.type = type;
    marker.dataset.index = index;
    marker.dataset.name = name;
    marker.dataset.fullName = name;
    
    marker.draggable = false;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'marker-icon';
    iconSpan.textContent = type === 'image' ? '📷' : '📎';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'marker-name';

    const displayName = getSmartDisplayName(name, index);
    nameSpan.textContent = displayName;

    marker.appendChild(iconSpan);
    marker.appendChild(nameSpan);

    // ✅ 单击：高亮附件
    marker.onclick = (e) => {
        e.preventDefault();
        highlightAttachment(type, index);
    };

    // ✅ 双击：重命名
    marker.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        renameMarker(marker, type, index);
    };

    // 悬停预览
    marker.onmouseenter = (e) => {
        showAttachmentPreview(type, index, e);
    };

    marker.onmouseleave = () => {
        hideAttachmentPreview();
    };

    // 右键菜单
    marker.oncontextmenu = (e) => {
        e.preventDefault();
        showMarkerContextMenu(marker, e);
    };
    
    return marker;
}


/**
 * 智能生成显示名称
 * @param {string} name - 完整文件名
 * @param {number} index - 索引（用于生成序号）
 * @returns {string} 显示名称
 */
function getSmartDisplayName(name, index) {
    // 去除扩展名
    const nameWithoutExt = name.replace(/\.[^/.]+$/, '');
    
    // 计算字符长度（中文算2个字符）
    const getLength = (str) => {
        let len = 0;
        for (let i = 0; i < str.length; i++) {
            len += str.charCodeAt(i) > 255 ? 2 : 1;
        }
        return len;
    };
    
    const length = getLength(nameWithoutExt);
    
    // ✅ 规则1：短文件名（≤12字符）显示完整
    if (length <= 12) {
        return nameWithoutExt;
    }
    
    // ✅ 规则2：中等长度（13-20字符）截断
    if (length <= 20) {
        return truncateString(nameWithoutExt, 10) + '...';
    }
    
    // ✅ 规则3：长文件名显示序号
    return `${index + 1}`;
}

/**
 * 智能截断字符串（考虑中英文）
 * @param {string} str - 原字符串
 * @param {number} maxLen - 最大长度（按中文字符计算）
 * @returns {string} 截断后的字符串
 */
function truncateString(str, maxLen) {
    let len = 0;
    let result = '';
    
    for (let i = 0; i < str.length; i++) {
        const charLen = str.charCodeAt(i) > 255 ? 2 : 1;
        if (len + charLen > maxLen) break;
        result += str[i];
        len += charLen;
    }
    
    return result;
}


async function saveCurrentMemoContent() {
    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;

    memo.title = document.getElementById('memoTitle').value.trim() || '无标题';

    const contentDiv = document.getElementById('memoContent');
    memo.content = getPlainTextWithMarkers(contentDiv);

    console.log('[saveCurrentMemoContent] 保存内容:', memo.content.substring(0, 100));

    memo.date = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    await saveMemo(memo);
}


/**
 * 从可编辑div提取纯文本，保留标记格式
 * @param {HTMLElement} element - 可编辑div
 * @returns {string} 纯文本内容
 */
function getPlainTextWithMarkers(element) {
    let result = '';

    element.childNodes.forEach((node, index) => {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 处理标记
            if (node.classList && node.classList.contains('attachment-marker')) {
                const type = node.dataset.type;
                const name = node.dataset.name;
                const icon = type === 'image' ? '📷' : '📎';
                result += `[${icon}${name}]`;
                console.log('[getPlainTextWithMarkers] 发现标记:', name);
            }
            // 处理换行
            else if (node.nodeName === 'BR') {
                result += '\n';
            }
            // 递归处理其他元素
            else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
                result += getPlainTextWithMarkers(node);
                if (index < element.childNodes.length - 1) {
                    result += '\n';
                }
            }
            // 其他元素获取文本内容
            else {
                result += node.textContent || '';
            }
        }
    });

    console.log('[getPlainTextWithMarkers] 最终结果:', result);
    return result;
}




async function saveCurrentMemo() {
    if (currentMemoId === null) return;

    await saveCurrentMemoContent();

    const memo = memos.find(m => m.id === currentMemoId);
    if (memo && !memo.title && !memo.content && (!memo.images || memo.images.length === 0)) {
        memos = memos.filter(m => m.id !== currentMemoId);
        await deleteMemoFromDB(currentMemoId);
        currentMemoId = null;
        document.getElementById('editorArea').classList.remove('active');
        document.getElementById('emptyState').classList.remove('hidden');
    }

    displayMemoList();
    updateMemoCount();
    showNotification('✓ 已保存');
}

async function deleteCurrentMemo() {
    if (currentMemoId === null) return;

    if (!confirm('确定要删除这条备忘录吗？')) return;

    await deleteMemoFromDB(currentMemoId);
    memos = memos.filter(m => m.id !== currentMemoId);
    currentMemoId = null;

    document.getElementById('memoTitle').value = '';
    document.getElementById('memoContent').value = '';
    document.getElementById('imageGallery').innerHTML = '';
    document.getElementById('editorArea').classList.remove('active');
    document.getElementById('emptyState').classList.remove('hidden');

    displayMemoList();
    updateMemoCount();

    showNotification('✓ 已删除');
}

// 从列表中删除备忘录
async function deleteMemoFromList(memoId) {
    if (!confirm('确定要删除这条备忘录吗？')) return;

    // 创建快照
    await createSnapshot('删除备忘录前');

    // 删除数据
    await deleteMemoFromDB(memoId);
    memos = memos.filter(m => m.id !== memoId);

    // 如果删除的是当前选中的备忘录，清空编辑区
    if (currentMemoId === memoId) {
        currentMemoId = null;
        document.getElementById('memoTitle').value = '';
        document.getElementById('memoContent').value = '';
        document.getElementById('imageGallery').innerHTML = '';
        document.getElementById('fileList').innerHTML = '';
        document.getElementById('editorArea').classList.remove('active');
        document.getElementById('emptyState').classList.remove('hidden');
    }

    // 更新显示
    displayMemoList();
    updateMemoCount();
    showNotification('✓ 已删除');
}

function searchMemos() {
    const keyword = document.getElementById('searchInput').value.toLowerCase();

    if (!keyword) {
        displayMemoList();
        return;
    }

    const filtered = memos.filter(memo =>
        memo.title.toLowerCase().includes(keyword) ||
        memo.content.toLowerCase().includes(keyword)
    );

    displayMemoList(filtered);
}

// ========== 图片处理 ==========
function displayImages(images) {
    const gallery = document.getElementById('imageGallery');

    if (!images || images.length === 0) {
        gallery.innerHTML = '';
        updateAttachmentCount();
        return;
    }

    gallery.innerHTML = '';

    images.forEach((imgObj, index) => {
        try {
            const imgData = typeof imgObj === 'string' ? imgObj : imgObj.data;
            const imgName = imgObj.tagName || imgObj.fileName || imgObj.name || `图片${index + 1}`;
            const fileName = imgObj.fileName || imgObj.name || `图片${index + 1}`;
            const hasLink = imgObj.linkedPosition !== undefined;

            if (!imgData) {
                console.warn(`图片 ${index} 数据无效，已跳过`);
                return;
            }

            const imageItem = document.createElement('div');
            imageItem.className = 'image-item';
            imageItem.dataset.index = index;
            imageItem.draggable = false;

            if (hasLink) {
                imageItem.classList.add('has-link');
            }

            imageItem.title = `标签：${imgName}\n文件：${fileName}`;

            imageItem.onclick = () => {
                openImageModal(imgData);
                flashMarkerInText('image', index);
            };

            const imgElement = document.createElement('img');

            // ✅ 添加懒加载
            imgElement.loading = 'lazy';
            imgElement.src = imgData;
            imgElement.alt = imgName;
            imgElement.draggable = false;

            imgElement.onerror = () => {
                console.error(`图片 ${imgName} 加载失败`);
                imgElement.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23f3f4f6" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" fill="%239ca3af" font-size="12"%3E加载失败%3C/text%3E%3C/svg%3E';
            };

            if (hasLink) {
                const linkIndicator = document.createElement('div');
                linkIndicator.className = 'link-indicator';
                linkIndicator.textContent = '🔗';
                linkIndicator.title = '已关联到文本';
                imageItem.appendChild(linkIndicator);
            }

            const removeBtn = document.createElement('button');
            removeBtn.className = 'image-remove';
            removeBtn.textContent = '×';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeImage(index);
            };

            imageItem.appendChild(imgElement);
            imageItem.appendChild(removeBtn);
            gallery.appendChild(imageItem);
        } catch (error) {
            console.error(`渲染图片 ${index} 时出错:`, error);
        }
    });

    updateAttachmentCount();
}


async function handleImageUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const contentDiv = document.getElementById('memoContent');

    const selection = window.getSelection();
    if (selection.rangeCount === 0 || !contentDiv.contains(selection.anchorNode)) {
        contentDiv.focus();
        const range = document.createRange();
        range.selectNodeContents(contentDiv);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        currentCursorPosition = true;
    }

    const storageInfo = await getStorageInfo();
    if (storageInfo && parseFloat(storageInfo.percentage) > 90) {
        const confirmed = confirm(
            `⚠️ 存储空间告急\n\n` +
            `已使用：${storageInfo.used}\n` +
            `总容量：${storageInfo.total}\n` +
            `使用率：${storageInfo.percentage}%\n\n` +
            `继续上传可能导致空间不足，建议先清理旧数据。\n是否继续？`
        );
        if (!confirmed) {
            event.target.value = '';
            return;
        }
    }

    showLoading();

    try {
        const memo = memos.find(m => m.id === currentMemoId);
        if (!memo) return;

        if (!memo.images) memo.images = [];

        let successCount = 0;
        let failedFiles = [];

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                failedFiles.push({ name: file.name, reason: '不是图片文件' });
                continue;
            }

            if (file.size > 5 * 1024 * 1024) {
                failedFiles.push({
                    name: file.name,
                    reason: `文件过大 (${formatFileSize(file.size)})`
                });
                continue;
            }

            try {
                const base64 = await compressAndConvertImage(file);

                const imageObj = {
                    id: Date.now() + Math.random(),
                    data: base64,
                    name: file.name,
                    tagName: file.name,
                    size: file.size,
                    type: 'image',
                    linkedPosition: currentCursorPosition,
                    timestamp: Date.now()
                };

                memo.images.push(imageObj);
                insertAttachmentMarker('image', memo.images.length - 1, file.name);
                successCount++;
            } catch (error) {
                console.error(`压缩图片 "${file.name}" 失败:`, error);
                failedFiles.push({ name: file.name, reason: '压缩失败' });
            }
        }

        await saveMemo(memo);
        displayImages(memo.images);
        displayMemoList();

        if (successCount > 0) {
            showNotification(`✓ 成功添加 ${successCount} 张图片`, 'success');
        }

        if (failedFiles.length > 0) {
            const failedInfo = failedFiles.map(f => `• ${f.name}: ${f.reason}`).join('\n');
            showNotification(`⚠️ 以下文件上传失败：\n${failedInfo}`, 'warning');
        }

        showStorageInfo();
    } catch (error) {
        console.error('图片上传失败:', error);
        showNotification('图片上传失败，请重试', 'error');
    } finally {
        hideLoading();
        event.target.value = '';
    }
}


// ========== 内联附件标记系统 ==========

/**
 * 在文本光标位置插入附件标记
 * @param {string} type - 'image' 或 'file'
 * @param {number} index - 附件索引
 * @param {string} name - 附件名称
 */
function insertAttachmentMarker(type, index, name) {
    console.log('[insertAttachmentMarker] 插入标记:', type, index, name);

    const contentDiv = document.getElementById('memoContent');

    // ✅ 检查是否有有效的选区
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
        // 没有选区时，在末尾添加
        contentDiv.focus();
        const range = document.createRange();
        range.selectNodeContents(contentDiv);
        range.collapse(false); // 移动到末尾
        selection.removeAllRanges();
        selection.addRange(range);
    }

    const range = selection.getRangeAt(0);

    // ✅ 确保插入点在内容区域内
    if (!contentDiv.contains(range.commonAncestorContainer)) {
        console.warn('[insertAttachmentMarker] 选区不在内容区域，移动到末尾');
        const newRange = document.createRange();
        newRange.selectNodeContents(contentDiv);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    // 移除占位符（如果有）
    const placeholder = contentDiv.querySelector('[data-placeholder]');
    if (placeholder) {
        placeholder.remove();
    }

    // 创建标记元素
    const marker = createAttachmentMarkerElement(type, index, name);

    // 插入标记
    try {
        const newRange = selection.getRangeAt(0);
        newRange.deleteContents();
        newRange.insertNode(marker);

        // ✅ 在标记后添加空格
        const space = document.createTextNode(' ');
        newRange.collapse(false);
        newRange.insertNode(space);

        // ✅ 移动光标到空格后
        newRange.setStartAfter(space);
        newRange.setEndAfter(space);

        selection.removeAllRanges();
        selection.addRange(newRange);

        console.log('[insertAttachmentMarker] 插入成功');

        // ✅ 立即触发保存
        scheduleAutoSave();
    } catch (error) {
        console.error('[insertAttachmentMarker] 插入失败:', error);
        showNotification('标记插入失败', 'error');
    }
}



/**
 * 高亮右侧对应的附件
 * @param {string} type - 'image' 或 'file'
 * @param {number} index - 附件索引
 */
function highlightAttachment(type, index) {
    // 移除之前的高亮
    document.querySelectorAll('.image-item.highlight, .file-item.highlight').forEach(el => {
        el.classList.remove('highlight');
    });

    // 高亮目标附件
    const targetSelector = type === 'image'
        ? `.image-item[data-index="${index}"]`
        : `.file-item[data-index="${index}"]`;

    const targetElement = document.querySelector(targetSelector);
    if (targetElement) {
        targetElement.classList.add('highlight');

        // 滚动到视图中
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 2秒后移除高亮
        setTimeout(() => {
            targetElement.classList.remove('highlight');
        }, 2000);
    }
}

/**
 * 点击右侧附件，文本中标记闪烁
 * @param {string} type - 'image' 或 'file'
 * @param {number} index - 附件索引
 */
function flashMarkerInText(type, index) {
    const contentDiv = document.getElementById('memoContent');
    const markers = contentDiv.querySelectorAll(`.attachment-marker[data-type="${type}"][data-index="${index}"]`);

    markers.forEach(marker => {
        marker.classList.add('flash');

        // 滚动到视图中
        marker.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 动画结束后移除class
        setTimeout(() => {
            marker.classList.remove('flash');
        }, 1800);
    });
}


/**
 * 从 DOM 中移除附件标记（用于实时编辑）
 * @param {string} name - 附件名称
 */
function removeAttachmentMarkerFromDOM(name) {
    const contentDiv = document.getElementById('memoContent');

    // 查找并移除所有匹配的标记
    const markers = contentDiv.querySelectorAll('.attachment-marker');
    markers.forEach(marker => {
        if (marker.dataset.name === name) {
            // ✅ 检查标记后面是否有空格文本节点
            const nextNode = marker.nextSibling;
            if (nextNode &&
                nextNode.nodeType === Node.TEXT_NODE &&
                nextNode.textContent.startsWith(' ')) {
                // 移除标记后的第一个空格
                nextNode.textContent = nextNode.textContent.substring(1);

                // 如果文本节点变空了，也删除它
                if (nextNode.textContent === '') {
                    nextNode.remove();
                }
            }

            // 移除标记本身
            marker.remove();
        }
    });

    // 触发保存
    scheduleAutoSave();
}




/**
 * 转义正则表达式特殊字符
 * @param {string} string - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * 解析文本中的附件标记
 * @param {string} content - 文本内容
 * @returns {Array} 标记列表
 */
function parseAttachmentMarkers(content) {
    const markers = [];
    const pattern = /\[(📷|📎)([^\]]+)\]/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
        markers.push({
            type: match[1] === '📷' ? 'image' : 'file',
            name: match[2],
            position: match.index,
            fullText: match[0]
        });
    }

    return markers;
}



function compressAndConvertImage(file, maxWidth = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        // 小于 500KB 的图片不压缩
        if (file.size < 500 * 1024) {
            console.log(`✓ 图片 "${file.name}" 小于500KB，保留原图`);
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (error) => {
                console.error('读取原图失败:', error);
                reject(error);
            };
            reader.readAsDataURL(file);
            return;
        }

        const reader = new FileReader();

        reader.onload = function(e) {
            const img = new Image();

            img.onload = function() {
                try {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth || height > maxWidth) {
                        if (width > height) {
                            height = (height / width) * maxWidth;
                            width = maxWidth;
                        } else {
                            width = (width / height) * maxWidth;
                            height = maxWidth;
                        }
                        console.log(`✓ 图片 "${file.name}" 缩放至 ${width}x${height}`);
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');

                    // ✅ 添加绘制错误检查
                    if (!ctx) {
                        throw new Error('无法获取Canvas上下文');
                    }

                    ctx.drawImage(img, 0, 0, width, height);

                    let outputFormat = 'image/jpeg';
                    let outputQuality = quality;

                    if (file.type === 'image/png') {
                        outputFormat = 'image/png';
                        outputQuality = 0.9;
                    } else if (file.type === 'image/webp') {
                        outputFormat = 'image/webp';
                        outputQuality = 0.88;
                    }

                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                reject(new Error('图片压缩失败：无法生成Blob'));
                                return;
                            }

                            if (blob.size >= file.size) {
                                console.log(`✓ 图片 "${file.name}" 压缩后更大，使用原图`);
                                const reader = new FileReader();
                                reader.onload = (e) => resolve(e.target.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(file);
                            } else {
                                const savedPercent = ((1 - blob.size / file.size) * 100).toFixed(1);
                                console.log(`✓ 图片 "${file.name}" 压缩 ${savedPercent}%`);
                                const reader = new FileReader();
                                reader.onload = (e) => resolve(e.target.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            }
                        },
                        outputFormat,
                        outputQuality
                    );
                } catch (error) {
                    console.error('图片处理过程出错:', error);
                    reject(error);
                }
            };

            img.onerror = (error) => {
                console.error('图片加载失败:', error);
                reject(new Error('图片加载失败'));
            };

            img.src = e.target.result;
        };

        reader.onerror = (error) => {
            console.error('读取文件失败:', error);
            reject(error);
        };

        reader.readAsDataURL(file);
    });
}


async function removeImage(index) {
    if (!confirm('确定要删除这张图片吗？')) return;

    const memo = memos.find(m => m.id === currentMemoId);
    if (memo && memo.images) {
        const imgObj = memo.images[index];
        const imgName = (typeof imgObj === 'string') ? `图片${index + 1}` : (imgObj.name || `图片${index + 1}`);

        // 删除图片数据
        memo.images.splice(index, 1);

        // ✅ 更新所有标记的索引
        const contentDiv = document.getElementById('memoContent');
        const markers = contentDiv.querySelectorAll(`.attachment-marker[data-type="image"]`);

        markers.forEach(marker => {
            const markerIndex = parseInt(marker.dataset.index);
            const markerName = marker.dataset.name;

            // 如果是被删除的标记，移除它
            if (markerName === imgName) {
                const nextNode = marker.nextSibling;
                if (nextNode && nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent.startsWith(' ')) {
                    nextNode.textContent = nextNode.textContent.substring(1);
                }
                marker.remove();
            }
            // 如果索引大于被删除的索引，减1
            else if (markerIndex > index) {
                marker.dataset.index = markerIndex - 1;
            }
        });

        // 保存更新后的内容
        memo.content = getPlainTextWithMarkers(contentDiv);
        await saveMemo(memo);

        displayImages(memo.images);
        displayMemoList();
        showNotification('✓ 图片已删除', 'success');
        showStorageInfo();
    }
}



// ========== 文件处理 ==========

// 获取文件图标
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();

    const icons = {
        // 文档类
        'pdf': '📄',
        'doc': '📝', 'docx': '📝',
        'txt': '📃',
        'rtf': '📃',

        // 表格类
        'xls': '📊', 'xlsx': '📊',
        'csv': '📊',

        // 演示文稿
        'ppt': '📽️', 'pptx': '📽️',

        // 压缩文件
        'zip': '🗜️', 'rar': '🗜️', '7z': '🗜️', 'tar': '🗜️', 'gz': '🗜️',

        // 音频
        'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵',

        // 视频
        'mp4': '🎬', 'avi': '🎬', 'mkv': '🎬', 'mov': '🎬',

        // 代码
        'js': '💻', 'py': '💻', 'java': '💻', 'cpp': '💻', 'c': '💻',
        'html': '💻', 'css': '💻', 'json': '💻', 'xml': '💻',

        // 其他
        'exe': '⚙️',
        'apk': '📱',
    };

    return icons[ext] || '📎';
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 显示文件列表
function displayFiles(files) {
    const fileList = document.getElementById('fileList');

    if (!files || files.length === 0) {
        fileList.innerHTML = '';
        updateAttachmentCount();
        return;
    }

    fileList.innerHTML = '';

    files.forEach((fileObj, index) => {
        try {
            // ✅ 优先显示标签名，其次是文件名
            const tagName = fileObj.tagName || fileObj.fileName || fileObj.name || `文件${index + 1}`;
            const fileName = fileObj.fileName || fileObj.name || `文件${index + 1}`;

            const hasLink = fileObj.linkedPosition !== undefined;

            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.dataset.index = index;

            if (hasLink) {
                fileItem.classList.add('has-link');
            }

            // ✅ 显示标签名和原始文件名
            fileItem.title = `标签：${tagName}\n文件：${fileName}\n大小：${formatFileSize(fileObj.size)}`;

            // 文件图标和信息
            const fileIcon = document.createElement('span');
            fileIcon.className = 'file-icon';
            fileIcon.textContent = getFileIcon(fileObj.type);

            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';

            // ✅ 显示标签名
            const fileName_text = document.createElement('div');
            fileName_text.className = 'file-name';
            fileName_text.textContent = tagName;
            fileName_text.title = tagName;

            const fileSize = document.createElement('div');
            fileSize.className = 'file-size';
            fileSize.textContent = formatFileSize(fileObj.size);

            fileInfo.appendChild(fileName_text);
            fileInfo.appendChild(fileSize);

            fileItem.appendChild(fileIcon);
            fileItem.appendChild(fileInfo);

            // 链接指示器
            if (hasLink) {
                const linkIndicator = document.createElement('div');
                linkIndicator.className = 'link-indicator';
                linkIndicator.textContent = '🔗';
                linkIndicator.title = '已关联到文本';
                fileItem.appendChild(linkIndicator);
            }

            // 操作按钮容器
            const actions = document.createElement('div');
            actions.className = 'file-actions';

            // 下载按钮
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'file-action-btn download';
            downloadBtn.textContent = '⬇️';
            downloadBtn.title = '下载';
            downloadBtn.onclick = (e) => {
                e.stopPropagation();
                downloadFile(index);
            };

            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'file-action-btn delete';
            deleteBtn.textContent = '×';
            deleteBtn.title = '删除';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                removeFile(index);
            };

            actions.appendChild(downloadBtn);
            actions.appendChild(deleteBtn);
            fileItem.appendChild(actions);

            // 点击定位到文本中的标记
            fileItem.onclick = () => {
                flashMarkerInText('file', index);
            };

            fileList.appendChild(fileItem);
        } catch (error) {
            console.error(`渲染文件 ${index} 时出错:`, error);
        }
    });

    updateAttachmentCount();
}


// 新增函数：更新附件计数
function updateAttachmentCount() {
    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) {
        document.getElementById('attachmentCount').textContent = '0 项';
        return;
    }

    const imageCount = memo.images ? memo.images.length : 0;
    const fileCount = memo.files ? memo.files.length : 0;
    const total = imageCount + fileCount;

    document.getElementById('attachmentCount').textContent = `${total} 项`;
}

// 处理文件上传
async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // ✅ 修复：不检查焦点，而是确保内容区域被聚焦
    const contentDiv = document.getElementById('memoContent');
    
    // ✅ 如果没有选区，自动聚焦到内容区域末尾
    const selection = window.getSelection();
    if (selection.rangeCount === 0 || !contentDiv.contains(selection.anchorNode)) {
        contentDiv.focus();
        const range = document.createRange();
        range.selectNodeContents(contentDiv);
        range.collapse(false); // 移动到末尾
        selection.removeAllRanges();
        selection.addRange(range);
        currentCursorPosition = true; // 标记为在内容区域
    }

    const storageInfo = await getStorageInfo();
    if (storageInfo && parseFloat(storageInfo.percentage) > 85) {
        const confirmed = confirm(
            `⚠️ 存储空间已使用 ${storageInfo.percentage}%\n` +
            `上传大文件可能导致空间不足。是否继续？`
        );
        if (!confirmed) {
            event.target.value = '';
            return;
        }
    }

    showLoading();

    try {
        const memo = memos.find(m => m.id === currentMemoId);
        if (!memo) return;

        if (!memo.files) memo.files = [];

        if (memo.files.length + files.length > 10) {
            showNotification(`每个备忘录最多10个文件，当前已有${memo.files.length}个`, 'warning');
            hideLoading();
            event.target.value = '';
            return;
        }

        let successCount = 0;

        for (const file of files) {
            if (file.size > 10 * 1024 * 1024) {
                showNotification(`文件 "${file.name}" 超过10MB，已跳过`, 'warning');
                continue;
            }

            const base64 = await fileToBase64(file);

            const fileObj = {
                id: Date.now() + Math.random(),
                name: file.name,
                type: file.type,
                size: file.size,
                data: base64,
                linkedPosition: currentCursorPosition,
                uploadDate: new Date().toISOString(),
                timestamp: Date.now()
            };

            memo.files.push(fileObj);
            insertAttachmentMarker('file', memo.files.length - 1, file.name);
            successCount++;
        }

        await saveMemo(memo);
        displayFiles(memo.files);
        displayMemoList();
        
        if (successCount > 0) {
            showNotification(`✓ 已添加 ${successCount} 个文件`, 'success');
        }

        showStorageInfo();
    } catch (error) {
        console.error('文件上传失败:', error);
        showNotification('文件上传失败，请重试', 'error');
    } finally {
        hideLoading();
        event.target.value = '';
    }
}


// 文件转 base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function(e) {
            resolve(e.target.result);
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 下载文件
function downloadFile(index) {
    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo || !memo.files || !memo.files[index]) return;

    const file = memo.files[index];

    // 创建下载链接
    const link = document.createElement('a');
    link.href = file.data;
    link.download = file.name;
    link.click();

    showNotification(`✓ 正在下载：${file.name}`);
}

// 删除文件
async function removeFile(index) {
    if (!confirm('确定要删除这个文件吗？')) return;

    const memo = memos.find(m => m.id === currentMemoId);
    if (memo && memo.files) {
        const fileObj = memo.files[index];
        const fileName = fileObj.name || `文件${index + 1}`;

        // ✅ 先从数据中移除
        memo.files.splice(index, 1);

        // ✅ 从内容文本中移除标记（包括空格）
        const contentDiv = document.getElementById('memoContent');
        memo.content = getPlainTextWithMarkers(contentDiv);

        const markerPattern = new RegExp(`\\[📎${escapeRegex(fileName)}\\]\\s?`, 'g');
        memo.content = memo.content.replace(markerPattern, '');

        // 保存并重新渲染
        await saveMemo(memo);

        // ✅ 重新渲染内容
        renderContentWithMarkers(memo.content, memo);

        displayFiles(memo.files);
        displayMemoList();
        showNotification('✓ 文件已删除', 'success');

        showStorageInfo();
    }
}






// ========== 图片预览模态框 ==========
function createImageModal() {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.id = 'imageModal';
    modal.innerHTML = `
        <button class="image-modal-close" onclick="closeImageModal()">×</button>
        <img id="modalImage" src="" alt="预览">
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeImageModal();
    });
}

function openImageModal(src) {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('modalImage');
    img.src = src;
    modal.classList.add('active');
}

function closeImageModal() {
    document.getElementById('imageModal').classList.remove('active');
}

// ========== 导出导入功能 ==========
function exportData() {
    const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        memos: memos
    };

    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `备忘录导出_${formatDateForFilename(new Date())}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showNotification('✓ 数据已导出');
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);

            if (!data.memos || !Array.isArray(data.memos)) {
                showNotification('❌ 无效的备份文件格式');
                return;
            }

            const confirmed = confirm(
                `确定要导入备份吗？\n\n` +
                `备份日期：${new Date(data.exportDate).toLocaleString('zh-CN')}\n` +
                `备忘录数量：${data.memos.length}\n\n` +
                `注意：这将覆盖当前所有数据！`
            );

            if (!confirmed) return;

            memos = data.memos;
            currentMemoId = null;

            await saveMemos();
            displayMemoList();
            updateMemoCount();
            document.getElementById('editorArea').classList.remove('active');
            document.getElementById('emptyState').classList.remove('hidden');
            showNotification('✓ 数据导入成功');

            // 更新存储使用情况
            showStorageInfo();
        } catch (error) {
            console.error('导入失败:', error);
            showNotification('❌ 导入失败，文件可能已损坏');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ========== 辅助功能 ==========
function updateMemoCount() {
    document.getElementById('memoCount').textContent = memos.length;
}

function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveCurrentMemo(), 1000);
}

function formatDate(date) {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateForFilename(date) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
}

function showLoading() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.remove();
}

// ========== 页面加载与退出 ==========
window.onload = init;
// ========== 版本历史管理 ==========

// 创建历史快照
async function createSnapshot(description = '自动备份') {
    return new Promise(async (resolve) => {
        if (!db || memos.length === 0) {
            resolve(false);
            return;
        }

        try {
            // ✅ 获取现有版本
            const versions = await getAllVersions();

            // ✅ 检查是否需要创建新版本
            if (versions.length > 0) {
                const lastVersion = versions[0];
                const timeDiff = Date.now() - lastVersion.timestamp;

                // 5分钟内不创建新版本（除非是手动触发）
                if (timeDiff < 5 * 60 * 1000 && description === '自动备份') {
                    console.log('⏭️ 跳过快照：距离上次不足5分钟');
                    resolve(false);
                    return;
                }

                // ✅ 检查内容是否有实质变化
                const currentContent = JSON.stringify(memos);
                const lastContent = JSON.stringify(lastVersion.memos);

                if (currentContent === lastContent && description === '自动备份') {
                    console.log('⏭️ 跳过快照：内容无变化');
                    resolve(false);
                    return;
                }
            }

            const snapshot = {
                timestamp: Date.now(),
                date: new Date().toISOString(),
                description: description,
                memos: JSON.parse(JSON.stringify(memos)),
                memoCount: memos.length,
                imageCount: memos.reduce((sum, m) => sum + (m.images?.length || 0), 0)
            };

            const transaction = db.transaction(['versions'], 'readwrite');
            const store = transaction.objectStore('versions');
            store.add(snapshot);

            transaction.oncomplete = async () => {
                console.log('✓ 已创建快照:', description);
                await cleanOldVersions(20); // ✅ 保留20个版本
                resolve(true);
            };

            transaction.onerror = () => {
                console.error('创建快照失败:', transaction.error);
                resolve(false);
            };
        } catch (error) {
            console.error('创建快照出错:', error);
            resolve(false);
        }
    });
}


// 获取所有历史版本
async function getAllVersions() {
    return new Promise((resolve) => {
        if (!db) {
            resolve([]);
            return;
        }

        const transaction = db.transaction(['versions'], 'readonly');
        const store = transaction.objectStore('versions');
        const request = store.getAll();

        request.onsuccess = () => {
            const versions = request.result || [];
            // 按时间降序排序
            versions.sort((a, b) => b.timestamp - a.timestamp);
            resolve(versions);
        };

        request.onerror = () => {
            console.error('获取版本历史失败:', request.error);
            resolve([]);
        };
    });
}

// 恢复到指定版本
async function restoreVersion(versionId) {
    return new Promise(async (resolve) => {
        if (!db) {
            resolve(false);
            return;
        }

        try {
            // 获取指定版本
            const transaction = db.transaction(['versions'], 'readonly');
            const store = transaction.objectStore('versions');
            const request = store.get(versionId);

            request.onsuccess = async () => {
                const version = request.result;
                if (!version) {
                    showNotification('版本不存在');
                    resolve(false);
                    return;
                }

                const confirmed = confirm(
                    `确定要恢复到此版本吗？\n\n` +
                    `版本时间：${new Date(version.timestamp).toLocaleString('zh-CN')}\n` +
                    `备忘录数量：${version.memoCount}\n` +
                    `图片数量：${version.imageCount}\n\n` +
                    `当前数据将被替换！`
                );

                if (!confirmed) {
                    resolve(false);
                    return;
                }

                // 先创建当前状态的快照
                await createSnapshot('恢复前备份');

                // 恢复数据
                memos = JSON.parse(JSON.stringify(version.memos));
                await saveMemos();

                // 刷新显示
                currentMemoId = null;
                displayMemoList();
                updateMemoCount();
                document.getElementById('editorArea').classList.remove('active');
                document.getElementById('emptyState').classList.remove('hidden');

                showNotification('✓ 已恢复到历史版本');
                resolve(true);
            };

            request.onerror = () => {
                showNotification('恢复失败，请重试');
                resolve(false);
            };
        } catch (error) {
            console.error('恢复版本出错:', error);
            showNotification('恢复失败：' + error.message);
            resolve(false);
        }
    });
}

// 删除指定版本
async function deleteVersion(versionId) {
    return new Promise((resolve) => {
        if (!db) {
            resolve(false);
            return;
        }

        const transaction = db.transaction(['versions'], 'readwrite');
        const store = transaction.objectStore('versions');
        const request = store.delete(versionId);

        request.onsuccess = () => {
            console.log('✓ 已删除版本');
            resolve(true);
        };

        request.onerror = () => {
            console.error('删除版本失败:', request.error);
            resolve(false);
        };
    });
}

// 清理旧版本（只保留最近10个）
async function cleanOldVersions(keepCount = 20) {
    const versions = await getAllVersions();
    if (versions.length <= keepCount) return;

    const toDelete = versions.slice(keepCount);
    for (const version of toDelete) {
        await deleteVersion(version.id);
    }

    console.log(`✓ 清理了 ${toDelete.length} 个旧版本，保留最近 ${keepCount} 个`);
}


// 显示版本历史
async function showVersionHistory() {
    const versions = await getAllVersions();

    // 创建模态框
    let modal = document.getElementById('versionModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'version-modal';
        modal.id = 'versionModal';
        document.body.appendChild(modal);
    }

    // 生成版本列表HTML
    let versionsHTML;
    if (versions.length === 0) {
        versionsHTML = `
            <div class="empty-versions">
                <div class="empty-versions-icon">🕐</div>
                <p>暂无历史版本</p>
                <p style="font-size: 12px; margin-top: 8px;">系统会在删除、导入数据时自动创建快照</p>
            </div>
        `;
    } else {
        versionsHTML = versions.map((version, index) => `
            <div class="version-item ${index === 0 ? 'current' : ''}">
                <div class="version-item-header">
                    <div class="version-item-date">
                        ${new Date(version.timestamp).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </div>
                    ${index === 0 ? '<span class="version-item-badge">最新</span>' : ''}
                </div>
                <div class="version-item-info">
                    📝 ${version.memoCount} 条备忘 | 🖼️ ${version.imageCount} 张图片 | ${version.description}
                </div>
                <div class="version-item-actions">
                    ${index > 0 ? `
                        <button class="btn-restore" onclick="restoreVersionAndClose(${version.id})">
                            恢复此版本
                        </button>
                        <button class="btn-delete-version" onclick="deleteVersionAndRefresh(${version.id})">
                            删除
                        </button>
                    ` : '<span style="font-size: 12px; color: #6b7280;">当前版本</span>'}
                </div>
            </div>
        `).join('');
    }

    modal.innerHTML = `
        <div class="version-modal-content">
            <div class="version-modal-header">
                <h2>🕐 版本历史</h2>
                <button class="version-modal-close" onclick="closeVersionHistory()">×</button>
            </div>
            <div class="version-modal-body">
                <div class="version-list">
                    ${versionsHTML}
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');

    // 点击背景关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeVersionHistory();
        }
    });
}

// 关闭版本历史
function closeVersionHistory() {
    const modal = document.getElementById('versionModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 恢复版本并关闭对话框
async function restoreVersionAndClose(versionId) {
    const success = await restoreVersion(versionId);
    if (success) {
        closeVersionHistory();
    }
}

// 删除版本并刷新列表
async function deleteVersionAndRefresh(versionId) {
    if (!confirm('确定要删除这个历史版本吗？')) return;

    const success = await deleteVersion(versionId);
    if (success) {
        // 刷新版本列表
        showVersionHistory();
        showNotification('✓ 版本已删除');
    }
}


// ========== 修改现有函数以支持快照 ==========

// 修改 deleteCurrentMemo 以在删除前创建快照
async function deleteCurrentMemoWithSnapshot() {
    if (currentMemoId === null) return;
    if (!confirm('确定要删除这条备忘录吗？')) return;

    await createSnapshot('删除备忘录前');

    await deleteMemoFromDB(currentMemoId);
    memos = memos.filter(m => m.id !== currentMemoId);
    currentMemoId = null;

    document.getElementById('memoTitle').value = '';
    document.getElementById('memoContent').value = '';
    document.getElementById('imageGallery').innerHTML = '';
    document.getElementById('fileList').innerHTML = '';
    document.getElementById('editorArea').classList.remove('active');
    document.getElementById('emptyState').classList.remove('hidden');

    // ✅ 隐藏标签管理按钮
    const manageBtn = document.querySelector('.marker-manage-btn');
    if (manageBtn) {
        manageBtn.style.display = 'none';
    }

    displayMemoList();
    updateMemoCount();

    showNotification('✓ 已删除');
}


// ========== 页面加载与退出 ==========
window.onload = init;

// ========== 拖拽上传功能 ==========
let dragDropInitialized = false; // 添加这个标志位

// 在 initDragAndDrop 函数中添加拖拽反馈
function initDragAndDrop() {
    if (dragDropInitialized) {
        console.log('拖拽功能已初始化，跳过');
        return;
    }

    const editorArea = document.getElementById('editorArea');
    const dropOverlay = document.getElementById('dropZoneOverlay');

    if (!editorArea || !dropOverlay) {
        console.log('拖拽元素未找到');
        return;
    }

    dragDropInitialized = true;
    console.log('初始化拖拽功能');

    let isDraggingOver = false;
    let dragCounter = 0; // ✅ 添加计数器，防止闪烁

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    editorArea.addEventListener('dragenter', (e) => {
        if (!editorArea.classList.contains('active')) return;

        dragCounter++; // ✅ 进入时计数+1
        if (dragCounter === 1) {
            dropOverlay.classList.remove('hidden');
            editorArea.classList.add('drag-over');
        }
    });

    editorArea.addEventListener('dragover', (e) => {
        if (!editorArea.classList.contains('active')) return;
        e.dataTransfer.dropEffect = 'copy';
    });

    editorArea.addEventListener('dragleave', (e) => {
        if (!editorArea.classList.contains('active')) return;

        dragCounter--; // ✅ 离开时计数-1
        if (dragCounter === 0) {
            dropOverlay.classList.add('hidden');
            editorArea.classList.remove('drag-over');
        }
    });

    editorArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        console.log('[drop事件] 触发');

        // ✅ 重置计数器
        dragCounter = 0;
        dropOverlay.classList.add('hidden');
        editorArea.classList.remove('drag-over');

        const titleInput = document.getElementById('memoTitle');
        if (e.target === titleInput || titleInput.contains(e.target)) {
            showNotification('⚠️ 标题区域不支持添加附件', 'warning');
            return;
        }

        const range = getCaretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
            const contentDiv = document.getElementById('memoContent');
            if (!contentDiv.contains(range.startContainer)) {
                showNotification('⚠️ 请在内容区域内拖放附件', 'warning');
                return;
            }

            currentCursorPosition = range.startOffset;
            console.log('[drop事件] 获取光标位置:', currentCursorPosition);
        }

        const files = e.dataTransfer.files;
        console.log('[drop事件] 文件数:', files.length);

        if (files.length === 0) return;

        const imageFiles = [];
        const otherFiles = [];

        for (let file of files) {
            if (file.type.startsWith('image/')) {
                imageFiles.push(file);
            } else {
                otherFiles.push(file);
            }
        }

        if (imageFiles.length > 0) {
            console.log('[drop事件] 处理图片:', imageFiles.length);
            handleDroppedImages(imageFiles);
        }

        if (otherFiles.length > 0) {
            console.log('[drop事件] 处理文件:', otherFiles.length);
            handleDroppedFiles(otherFiles);
        }
    }, false);
}


// 处理拖拽的图片
async function handleDroppedImages(files) {
    console.log('[handleDroppedImages] 开始处理', files.length, '个图片');

    // ✅ 检查是否在内容区域拖拽
    if (currentCursorPosition === null) {
        showNotification('⚠️ 请在内容区域内拖放图片', 'warning');
        return;
    }

    const currentMemo = memos.find(m => m.id === currentMemoId);
    if (!currentMemo) {
        showNotification('请先选择一个备忘录', 'error');
        return;
    }

    if (!currentMemo.images) {
        currentMemo.images = [];
    }

    showLoading();
    let successCount = 0;

    for (const file of files) {
        try {
            if (file.size > 5 * 1024 * 1024) {
                showNotification(`图片 "${file.name}" 超过5MB，已跳过`, 'warning');
                continue;
            }

            // ✅ 移除重复检查，直接添加
            const base64 = await compressAndConvertImage(file);

            const imageObj = {
                id: Date.now() + Math.random(),
                data: base64,
                name: file.name,
                tagName: file.name,
                size: file.size,
                type: 'image',
                linkedPosition: currentCursorPosition,
                timestamp: Date.now()
            };

            currentMemo.images.push(imageObj);
            const newIndex = currentMemo.images.length - 1;

            console.log('[handleDroppedImages] 插入标记:', file.name, '索引:', newIndex);
            insertAttachmentMarker('image', newIndex, file.name);

            successCount++;
        } catch (error) {
            console.error('[handleDroppedImages] 处理失败:', error);
            showNotification(`图片 "${file.name}" 处理失败`, 'error');
        }
    }

    if (successCount > 0) {
        const contentDiv = document.getElementById('memoContent');
        const newContent = getPlainTextWithMarkers(contentDiv);

        console.log('[handleDroppedImages] 提取的内容:', newContent);

        currentMemo.content = newContent;
        await saveMemo(currentMemo);

        displayImages(currentMemo.images);
        displayMemoList();

        showNotification(`✓ 成功添加 ${successCount} 张图片`, 'success');
    }

    hideLoading();
}


// 处理拖拽的文件
async function handleDroppedFiles(files) {
    console.log('[handleDroppedFiles] 开始处理', files.length, '个文件');

    // ✅ 检查是否在内容区域拖拽
    if (currentCursorPosition === null) {
        showNotification('⚠️ 请在内容区域内拖放文件', 'warning');
        return;
    }

    const currentMemo = memos.find(m => m.id === currentMemoId);
    if (!currentMemo) {
        showNotification('请先选择一个备忘录', 'error');
        return;
    }

    if (!currentMemo.files) {
        currentMemo.files = [];
    }

    if (currentMemo.files.length >= 10) {
        showNotification(`每个备忘录最多10个文件`, 'warning');
        return;
    }

    showLoading();
    let successCount = 0;

    for (const file of files) {
        if (currentMemo.files.length + successCount >= 10) {
            showNotification(`已达到文件数量上限（10个）`, 'warning');
            break;
        }

        try {
            if (file.size > 10 * 1024 * 1024) {
                showNotification(`文件 "${file.name}" 超过10MB，已跳过`, 'warning');
                continue;
            }

            // ✅ 移除重复检查
            const base64 = await fileToBase64(file);

            const fileObj = {
                id: Date.now() + Math.random(),
                name: file.name,
                type: file.type,
                size: file.size,
                data: base64,
                linkedPosition: currentCursorPosition,
                uploadDate: new Date().toISOString(),
                timestamp: Date.now()
            };

            currentMemo.files.push(fileObj);
            const newIndex = currentMemo.files.length - 1;

            console.log('[handleDroppedFiles] 插入标记:', file.name, '索引:', newIndex);
            insertAttachmentMarker('file', newIndex, file.name);

            successCount++;
        } catch (error) {
            console.error('[handleDroppedFiles] 处理失败:', error);
            showNotification(`文件 "${file.name}" 处理失败`, 'error');
        }
    }

    if (successCount > 0) {
        const contentDiv = document.getElementById('memoContent');
        const newContent = getPlainTextWithMarkers(contentDiv);

        console.log('[handleDroppedFiles] 提取的内容:', newContent);

        currentMemo.content = newContent;
        await saveMemo(currentMemo);

        displayFiles(currentMemo.files);
        displayMemoList();

        showNotification(`✓ 成功添加 ${successCount} 个文件`, 'success');
    }

    hideLoading();
}



/**
 * 获取鼠标位置对应的 Range
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @returns {Range|null}
 */
function getCaretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
        return document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        return range;
    }
    return null;
}


// ========== 页面初始化 ==========
window.addEventListener('DOMContentLoaded', () => {
    init(); // 初始化应用
    initDragAndDrop(); // 初始化拖拽功能
});
// 在 init() 函数开始添加
window.addEventListener('error', (event) => {
    console.error('全局错误:', event.error);
    showNotification('应用出现错误，请刷新页面', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的Promise拒绝:', event.reason);
    showNotification('操作失败，请重试', 'error');
});


// ========== 标签重命名功能 ==========

/**
 * 双击标签进行重命名
 * @param {HTMLElement} marker - 标记元素
 * @param {string} type - 'image' 或 'file'
 * @param {number} index - 附件索引
 */
function renameMarker(marker, type, index) {
    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;

    // ✅ 隐藏预览气泡
    clearTimeout(previewTimeout);
    hideAttachmentPreview();

    const oldTagName = marker.dataset.name;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldTagName;
    input.style.cssText = `
        width: 150px;
        padding: 4px 8px;
        border: 2px solid #667eea;
        border-radius: 4px;
        font-size: 13px;
        outline: none;
        background: white;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    `;

    const parent = marker.parentNode;
    const nextSibling = marker.nextSibling;
    parent.replaceChild(input, marker);
    input.focus();
    input.select();

    const finishRename = async () => {
        const newTagName = input.value.trim();

        if (nextSibling) {
            parent.insertBefore(marker, nextSibling);
        } else {
            parent.appendChild(marker);
        }
        input.remove();

        if (!newTagName || newTagName === oldTagName) {
            return;
        }

        // ✅ 修改：只更新 tagName，保留 fileName
        const attachments = type === 'image' ? memo.images : memo.files;
        const attachment = attachments[index];

        if (!attachment) return;

        // 检查标签名是否重复
        const isDuplicate = attachments.some(
            (item, idx) => idx !== index && (item.tagName || item.fileName) === newTagName
        );

        if (isDuplicate) {
            showNotification('⚠️ 该标签名已存在', 'warning');
            return;
        }

        // ✅ 更新标签名（不改变文件名）
        attachment.tagName = newTagName;

        // ✅ 更新文本中的标记
        const contentDiv = document.getElementById('memoContent');
        let content = getPlainTextWithMarkers(contentDiv);

        const icon = type === 'image' ? '📷' : '📎';
        const oldMarkerText = `[${icon}${oldTagName}]`;
        const newMarkerText = `[${icon}${newTagName}]`;

        content = content.split(oldMarkerText).join(newMarkerText);
        memo.content = content;

        await saveMemo(memo);
        renderContentWithMarkers(content, memo);

        if (type === 'image') {
            displayImages(memo.images);
        } else {
            displayFiles(memo.files);
        }

        displayMemoList();
        showNotification('✓ 标签已重命名（文件名未改变）', 'success');
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishRename();
        } else if (e.key === 'Escape') {
            if (nextSibling) {
                parent.insertBefore(marker, nextSibling);
            } else {
                parent.appendChild(marker);
            }
            input.remove();
        }
    });

    input.addEventListener('blur', finishRename);
}

