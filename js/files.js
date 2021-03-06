window.utils = window.utils || {};

window.utils.files = (function() {	
	function getSize(size) {
		var quantity, unit;
		
		if (size < Math.pow(1024, 2)) {
			quantity = size / 1024;
			unit = "KB";
		} else if (size < Math.pow(1024, 3)) {
			quantity = size / Math.pow(1024, 2);
			unit = "MB";
		} else {
			quantity = size / Math.pow(1024, 3);
			unit = "GB";
		}
		
		return quantity.toFixed(2) + " " + unit;
	}
	
	function getMIME(ext) {
		var returned = {actions: '', mime: ''};
		
		for (var i = 0; i < MIME.length; i++) {
			if (MIME[i].extensions.indexOf(ext) > -1) {
				returned = MIME[i];
				break;
			}
		}
		
		if (!('labels' in returned)) {
			returned.labels = [];
		}
		
		return returned;
	}
	
	function getType(file) {
		var filename = file.split('/').pop();
		var parts = filename.split('.');
		
		if (parts.length > 1) {
			var MIME = getMIME(parts.pop());
			
			return MIME.mime;
		}
		
		return '';
	}
	
	function getIcon(type, ext) {
		var name = 'unknown';
		
		if (type.length > 0) {
			for (var i = 0; i < MIME.length; i++) {
				if (new RegExp(MIME[i].pattern) .test(type)) {
					name = MIME[i].class;
					break;
				}
			}
		} else {
			for (var j = 0; j < MIME.length; j++) {
				if (MIME[j].extensions.indexOf(ext) > -1) {
					name = MIME[j].class;
					break;
				}
			}
		}
		
		return name;
	}
	
	return {
		'size': getSize,
		'mime': getMIME,
		'icon': getIcon,
		'type': getType
	};
})();

var files = (function () {
	var _ = window.navigator.mozL10n.get;
	var microtime = 0; // Prevents bubble for tap
	var curDir = '';
	var allFiles = [];
	var allCards = []; // If it is needed
	var curFile = null;
	var curItem = null;
	var fileList = document.querySelector('#index .files');
	var tasks = [];
	
	function addTask(action, source, target, onsuccess, onerror) {
		source.dir = source.dir || curDir;
		source.file = source.file || curFile;
		source.item = source.item || curItem;
		
		switch (action) {
			case 'delete':
				deleteFile(source.file.blob.name, source.item, source.dir);
				break;
			case 'rename':
				var filename = '/' + source.dir + '/' + target.name;
				
				replaceFile(source.file.blob.name, {
					'name': filename,
					'type': utils.files.type(filename),
					'size': source.file.blob.size
				}, filename, true);
				
				showFileList();
				break;
			case 'copy':
				if (target.replace) {
					replaceFile(source.file.blob.name, source.file.blob, false, true);
				} else {
					pushFile({'name': target.name, 'blob': {
						'name': target.name,
						'type': source.file.blob.type,
						'size': source.file.blob.size
					}, 'preview': true});
				}
				
				if (target.dir === curDir) {
					showFileList();
				}
				break;
			case 'move':
				deleteFile(source.file.blob.name, source.item, source.dir);
				
				if (target.replace) {
					replaceFile(target.name, source.file.blob, false, true);
				} else {
					pushFile({'name': target.name, 'blob': {
						'name': target.name,
						'type': source.file.blob.type,
						'size': source.file.blob.size
					}, 'preview': true});
				}
				break;
		}
		
		tasks.push({'action': action, 'source': source, 'target': target, 'onsuccess': onsuccess, 'onerror': onerror})
		
		this.isExecuting = true;
	}
	
	function executeTasks() {
		if (tasks.length > 0) {
			var task = tasks.shift();
			var action = task.action;
			var source = task.source;
			var target = task.target;
			var onsuccess = task.onsuccess || null;
			var onerror = task.onerror || null;
			
			source.file = source.file || curFile;
			source.dir = source.dir || curDir;
			
			switch (action) {
				case 'delete':
					storage.delete(source.file.blob.name, function () {
						source.file.blob = null;
						source.file = null;
						onsuccess();
						executeTasks();
					}, function () {
						onerror();
						executeTasks();
					});
					break;
				case 'rename':
					var filename = '/' + source.dir + '/' + target.name;
					
					storage.create(source.file.blob, filename, function () {
						storage.delete(source.file.blob.name, function () {
							storage.get(filename, function (e) {
								source.file.blob = null;
								source.file = null;
								
								replaceFile(filename, e.target.result);
								
								if (source.dir === curDir) {
									showFileList();
								}
								
								onsuccess();
								executeTasks();
							}, function () {
								onerror();
								executeTasks();
							});
						}, function () {
							onerror();
							executeTasks();
						});
					}, function () {
						onerror();
						executeTasks();
					});
					break;
				case 'copy':
					var filename = target.name;
					
					if (target.replace) {
						storage.delete(filename, function () {
							storage.create(source.file.blob, filename, function () {
								storage.get(filename, function (e) {								
									replaceFile(filename, e.target.result);
									
									if (target.dir === curDir) {
										showFileList();
									}
									
									onsuccess();
									executeTasks();
								}, function () {
									onerror();
									executeTasks();
								});
							}, function () {
								onerror();
								executeTasks();
							});
						}, function () {
							onerror();
							executeTasks();
						});
					} else {
						storage.create(source.file.blob, filename, function () {
							storage.get(filename, function (e) {
								replaceFile(filename, e.target.result);
									
								if (target.dir === curDir) {
									showFileList();
								}
								
								onsuccess();
								executeTasks();
							}, function () {
								onerror();
								executeTasks();
							});
						}, function () {
							onerror();
							executeTasks();
						});
					}
					break;
				case 'move':
					var filename = target.name;
					
					if (target.replace) {
						storage.delete(filename, function () {
							storage.create(source.file.blob, filename, function () {
								storage.get(filename, function (e) {
									var result = e.target.result;
									
									storage.delete(source.file.blob.name, function () {
										replaceFile(filename, result);
									
										if (target.dir === curDir) {
											showFileList();
										}
										
										onsuccess();
										executeTasks();
									}, function () {
										onerror();
										executeTasks();
									});
								}, function () {
									onerror();
									executeTasks();
								});
							}, function () {
								onerror();
								executeTasks();
							});
						}, function () {
							onerror();
							executeTasks();
						});
					} else {
						storage.create(source.file.blob, filename, function () {
							storage.get(filename, function (e) {
								var result = this.result;
								
								storage.delete(source.file.blob.name, function () {
									replaceFile(filename, result);
									
									if (target.dir === curDir) {
										showFileList();
									}
									
									onsuccess();
									executeTasks();
								}, function () {
									onerror();
									executeTasks();
								});
							}, function () {
								onerror();
								executeTasks();
							});
						}, function () {
							onerror();
							executeTasks();
						});
					}
					break;
			}
		} else {
			files.isExecuting = false;
		}
	}
	
	function pushFile(objFile) {
		allFiles.push(objFile);
	}
	
	function pushCard(objCard) {
		allCards.push(objCard);
	}
	
	function setFileList(arrList) {
		allFiles = arrList;
	}
	
	function clearFileList() {
		allFiles.length = 0;
	}
	
	function showFileList() {
		fileList.innerHTML = '';
		
		if (curDir.length > 0) {
			var filesFound = [];
			var foldersFound = [];
			
			for (var i = 0; i < allFiles.length; i++) {
				var file = allFiles[i];
				
				if (file.name.indexOf('/' + curDir + '/') === 0) {
					var parts = file.name.replace('/' + curDir + '/', '').split('/');
					
					if (parts.length > 1) {
						if (foldersFound.indexOf(parts[0]) < 0) {
							foldersFound.push(parts[0]);
						}
					} else {
						var extParts = parts[0].split('/').pop().split('.'), empty = false;
						
						if (extParts.length > 1) {
							if (extParts[0].length === 0 && extParts[1].toLowerCase() === 'empty') {
								empty = true;
							}
						}
						
						if (!empty) {
							filesFound.push({'name': parts[0], 'blob': file.blob, 'ext': (extParts.length > 1 ? extParts.pop().toLowerCase() : ''), 'preview': file.preview});
						}
					}
				}
			}
			
			foldersFound.sort(function (a, b) {
				return a.localeCompare(b);
			});
			
			filesFound.sort(function (a, b) {
				return a.name.localeCompare(b.name);
			});
			
			var liElem, asideElem, divElem, aElem, p1Elem, p2Elem;
			
			for (var j = 0; j < foldersFound.length; j++) {
				liElem = document.createElement('li');
				liElem.className = 'folder';
				asideElem = document.createElement('aside');
				divElem = document.createElement('div');
				aElem = document.createElement('a');
				p1Elem = document.createElement('p');
				
				asideElem.className = 'pack-start';
				divElem.className = 'file-icon folder';
				asideElem.appendChild(divElem);
				
				aElem.href = '#';
				aElem.onclick = function (folderName) {
					return function (event) {
						if (new Date() - microtime > 500) {
							microtime = new Date();
							
							var selector = '[name="side"]:not(.current):not(.left-to-current)';
							var section = document.querySelector(selector);
							var folder = document.querySelector('#folder');
							fileList = document.querySelector(selector + ' .files');
							
							curDir += '/' + folderName;
							
							folder.innerHTML = '';
							folder.appendChild(document.createTextNode(folderName));
							
							showFileList();
							
							document.querySelector('.current, .left-to-current').className = 'left';
							section.className = 'current';
							
							if (document.querySelector('#back')) {
								if (!document.querySelector('#back').classList.contains('folder') && !window.isActivity) {
									document.querySelector('#back').style.visibility = 'visible';
								} else {
									document.querySelector('#back').style.display = 'block';
									document.querySelector('#close').style.display = 'none';
								}
							}
						}
					};
				} (foldersFound[j]);
				
				p1Elem.appendChild(document.createTextNode(foldersFound[j]));
				aElem.appendChild(p1Elem);
				
				liElem.appendChild(asideElem);
				liElem.appendChild(aElem);
				
				fileList.appendChild(liElem);
			}
			
			for (var k = 0; k < filesFound.length; k++) {
				liElem = document.createElement('li');
				liElem.className = 'file';
				asideElem = document.createElement('aside');
				divElem = document.createElement('div');
				aElem = document.createElement('a');
				p1Elem = document.createElement('p');
				p2Elem = document.createElement('p');
				
				asideElem.className = 'pack-start';
				divElem.className = 'file-icon ' + utils.files.icon(filesFound[k].blob.type, filesFound[k].ext);
				asideElem.appendChild(divElem);
				
				aElem.href = '#';
				aElem.onclick = function (fileName, fileBlob, fileExt) {
					return function () {
						if (!window.isActivity) {
							var fileMime = utils.files.mime(fileExt);
							console.log(fileMime);
							var actions = {'allowed': fileMime.actions, 'labels': fileMime.labels};
							
							curFile = {'name': fileName, 'blob': fileBlob, 'ext': fileExt, 'mime': fileMime.mime};
							curItem = this.offsetParent;
							
							utils.actions.show(fileName, actions);
						} else if (window.isActivity === 'file') {
							window.activity.postResult({
								'type': fileBlob.type,
								'blob': fileBlob
							});
						}
					};
				} (filesFound[k].name, filesFound[k].blob, filesFound[k].ext);
				
				p1Elem.appendChild(document.createTextNode(filesFound[k].name));
				p2Elem.appendChild(document.createTextNode(utils.files.size(filesFound[k].blob.size)));
				aElem.appendChild(p1Elem);
				aElem.appendChild(p2Elem);
				
				liElem.appendChild(asideElem);
				liElem.appendChild(aElem);
				
				if (filesFound[k].preview) {
					liElem.dataset.disabled = 'true';
				}
				
				fileList.appendChild(liElem);
			}
			
			var folderHeader = document.querySelector('[data-type="sidebar"] > header > h1');
			var valueHeader = curDir.split('/').pop();
			
			if (folderHeader) {
				folderHeader.innerHTML = '';
				folderHeader.appendChild(document.createTextNode(valueHeader + '/'));
			}
		} else {
			var liElem, asideElem, divElem, aElem, p1Elem, p2Elem;
			
			if (!window.isActivity) {
				document.querySelector('#drawer menu[type="toolbar"]').style.display = 'none';
			}
			
			for (var j = 0; j < allCards.length; j++) {
				liElem = document.createElement('li');
				liElem.className = 'folder';
				asideElem = document.createElement('aside');
				divElem = document.createElement('div');
				aElem = document.createElement('a');
				p1Elem = document.createElement('p');
				p2Elem = document.createElement('p');
				
				asideElem.className = 'pack-start';
				divElem.className = 'file-icon card';
				asideElem.appendChild(divElem);
				
				aElem.href = '#';
				aElem.onclick = function (cardName) {
					return function (event) {
						if (new Date() - microtime > 500) {
							microtime = new Date();
							
							var selector = '[name="side"]:not(.current):not(.left-to-current)';
							var section = document.querySelector(selector);
							var folder = document.querySelector('#folder');
							fileList = document.querySelector(selector + ' .files');
							
							curDir = cardName;
							
							folder.innerHTML = '';
							folder.appendChild(document.createTextNode(cardName));
							
							storage.set(cardName);
							
							if (!window.isActivity) {
								document.querySelector('#drawer menu[type="toolbar"]').style.display = 'block';
							}
							
							showFileList();
							
							document.querySelector('.current, .left-to-current').className = 'left';
							section.className = 'current';
							
							if (document.querySelector('#back')) {
								if (!document.querySelector('#back').classList.contains('folder') && !window.isActivity) {
									document.querySelector('#back').style.visibility = 'visible';
								} else {
									document.querySelector('#back').style.display = 'block';
									document.querySelector('#close').style.display = 'none';
								}
							}
						}
					};
				} (allCards[j].name);
				
				p1Elem.appendChild(document.createTextNode(allCards[j].name));
				p2Elem.appendChild(document.createTextNode(utils.files.size(allCards[j].space) + _('of-free-space')));
				aElem.appendChild(p1Elem);
				aElem.appendChild(p2Elem);
				
				liElem.appendChild(asideElem);
				liElem.appendChild(aElem);
				
				fileList.appendChild(liElem);
			}
		}
	}
	
	function deleteFile(strName, htmlItem, strDir) {		
		for (var i = 0; i < allFiles.length; i++) {
			if (allFiles[i].name === strName) {
				allFiles.splice(i, 1);
				break;
			}
		}
		
		htmlItem.parentNode.removeChild(htmlItem);
		
		if (strDir !== undefined) {
			if (!hasFiles(strDir)) {
				storage.create(new Blob(['']), '/' + strDir + '/.empty');
			}
		}
	}
	
	function changeFileName(strOld, strNew, objFile) {
		for (var i = 0; i < allFiles.length; i++) {
			if (allFiles[i].name === strOld) {
				allFiles[i]['name'] = strNew;
				allFiles[i]['blob'] = objFile;
				break;
			}
		}
	}
	
	function replaceFile(oldFile, blobFile, newFile, preview) {
		newFile = newFile || oldFile;
		preview = preview || false;
		
		for (var i = 0; i < allFiles.length; i++) {
			if (allFiles[i].name === oldFile) {
				allFiles[i].name = newFile;
				allFiles[i].blob = null;
				allFiles[i].blob = blobFile;
				allFiles[i].preview = preview;
				break;
			}
		}
	}
	
	function callBack(funCallback) {
		funCallback(curFile, curDir, curItem);
	}
	
	function isFile(strName) {
		for (var i = 0; i < allFiles.length; i++) {
			if (allFiles[i].name === strName) {
				return true;
			}
		}
		
		return false;
	}
	
	function hasFiles(strPath) {
		for (var i = 0; i < allFiles.length; i++) {
			if (allFiles[i].name.indexOf('/' + strPath + '/') === 0) {
				return true;
			}
		}
		
		return false;
	}
	
	if (document.querySelector('#back')) {
		document.querySelector('#back').addEventListener('click', function (event) {
			var parts = curDir.split('/');
			parts.splice(parts.length - 1, 1);
			
			var folderName = parts.length > 0 ? parts[parts.length - 1] : '';
			
			curDir = parts.join('/');
						
			if ((allCards.length === 0 && parts.length > 1) || (allCards.length > 0 && parts.length > 0)) {
				var selector = '[name="side"]:not(.current):not(.left-to-current)';
				var section = document.querySelector(selector);
				
				fileList = document.querySelector(selector + ' .files');
				
				folder.innerHTML = '';
				folder.appendChild(document.createTextNode(folderName));
				
				files.show();
				
				document.querySelector('.current, .left-to-current').className = 'right';
				section.className = 'left-to-current';

			} else if((allCards.length === 0 && parts.length === 1) || (allCards.length > 0 && parts.length === 0)) {
				document.querySelector('.current, .left-to-current').className = 'right';
				document.querySelector('section[data-position="current"]').className = 'current';
				
				if (!document.querySelector('#back').classList.contains('folder') && !window.isActivity) {
					document.querySelector('#back').style.visibility = 'hidden';
				} else {
					document.querySelector('#back').style.display = 'none';
					document.querySelector('#close').style.display = 'block';
				}
				
				fileList = document.querySelector('section[data-position="current"] .files');
				
				folder.innerHTML = 'File Manager';
				
				files.show();
			}
		});
	}
	
	if (window.isActivity) {
		document.querySelector('#close').onclick = function (e) {
			if (window.activity) {
				window.activity.postError('Activity cancelled');
				window.activity = null;
			}
		};
	}
	
	return {
		set path(strPath) {
			curDir = strPath;
		},
		get isExecuting() {
			if ('state' in document.querySelector('#refresh').dataset) {
				return document.querySelector('#refresh').dataset.state === 'executing';
			}
			
			return false;
		},
		set isExecuting(state) {
			if (state) {
				var exec = !this.isExecuting;
				
				document.querySelector('#refresh').dataset.state = 'executing';
				
				if (exec) {
					executeTasks();
				}
				
			} else {
				document.querySelector('#refresh').dataset.state = '';
			}
			
			return state;
		},
		'call': callBack,
		'card': pushCard,
		'change': changeFileName,
		'delete': deleteFile,
		'isFile': isFile,
		'hasFiles': hasFiles,
		'push': pushFile,
		'replace': replaceFile,
		'reset': clearFileList,
		'set': setFileList,
		'show': showFileList,
		'task': addTask,
	};
})();
