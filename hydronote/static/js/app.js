var app = angular.module('NoteApp', [
    'ui.router',
    'ui.tinymce'
]);

app.constant('BASE_URL', 'api/notes/');


app.config(function($stateProvider, $urlRouterProvider, $httpProvider) {
    // Set CSRF token cookies to match Django's defaults
    $httpProvider.defaults.xsrfCookieName = 'csrftoken';
    $httpProvider.defaults.xsrfHeaderName = 'X-CSRFToken';

    // Set head so Django understands POST format
    $httpProvider.defaults.headers.post['CONTENT-TYPE'] =
        'application/x-www-form-urlencoded';

    // Set up templating URLs
    $stateProvider
        .state('home', {
            url: '/',
            templateUrl: '/static/templates/home.html',
            controller: 'mainController'
        });

    $urlRouterProvider.otherwise('/');
});


app.service('Notes', function($http, BASE_URL) {
    var Notes = {};

    Notes.all = function() {
        return $http.get(BASE_URL);
    };

    Notes.get = function(id) {
        return $http.get(BASE_URL + id + '/');
    };

    Notes.save = function(updatedNote) {
        return $http.put(BASE_URL + updatedNote.id + '/', updatedNote);
    };

    Notes.delete = function(id) {
        return $http.delete(BASE_URL + id + '/');
    };

    Notes.add = function(newNote) {
        return $http.post(BASE_URL, newNote);
    };

    return Notes;
});


app.controller('mainController', function($scope, Notes, $state, $q) {
    // currently selected item
    $scope.currentNote = {};

    // tags that are expanded (to display notes under category)
    $scope.expandedTagList = [];

    // most recently updated note data
    $scope.noteData = [];

    // List of objects with note or tag data to summarize notes in menu:
    //  title, id, tag, index, type, isExpanded
    $scope.noteTitleList = [];

    // Refresh list of notes. If loadFromServer, data is reloaded; otherwise,
    // just update list based on $scope.noteData.
    updateList = function(loadFromServer) {
        if (loadFromServer) {
            return Notes.all().then(function(res) {
                $scope.noteData = res.data;
                updateNoteList($scope, $scope.noteData);
            });
        } else {
            return $q(function(resolve, reject) {
                updateNoteList($scope, $scope.noteData);
                return resolve('notes updated!');
            });
        }
    };

    // Handle click on an item (tag or note title) in the list
    $scope.listSelect = function(listID, $event) {
        var s = listID.split(':');
        // If a tag has been clicked: toggle category's expansion
        if (s[0] == 'tag-click') {
            var tag = s.slice(1).join(':'); // Rejoin tags that had a colon in them
            tagIndex = $scope.expandedTagList.indexOf(tag);
            if (tagIndex > -1) { // Remove from expandedTagList if already expanded
                $scope.expandedTagList.splice(tagIndex, 1);
            } else {
                $scope.expandedTagList.push(tag);
            }
            // Stop event propogation to prevent menu from being exited
            $event.stopPropagation();
        // A Note has been clicked: select in editor
        } else {
            $scope.selectNote(listID);
        }
        updateList(false);
    };

    // Select a note to begin editing
    $scope.selectNote = function(id) {
        Notes.get(id).then(function(res) {
            // update selected note
            $scope.currentNote = res.data;
            // update note list
            var noteIndex = $scope.noteData.findIndex(function(item) {
                return item.id == id;
            });
            var note = $scope.noteData[noteIndex];
            note.note_title = res.data.note_title;
            note.note_text = res.data.note_text;
            note.tags = res.data.tags;
            updateList(false);
        });
    };

    // Create a blank note object (with no ID) and assign to $scope.currentNote
    $scope.addNote = function() {
        newNote = { note_title: 'A New Note',
                    note_text: '<i>Inspired thoughts go here!<i>' };
        $scope.currentNote = newNote;
        $scope.message = '';
    };

    // Save currently selected note on submission of tinyMCE form
    $scope.saveNote = function() {
        $scope.postMessage('Note saved');

        // If selected note already exists, update in database
        if ($scope.currentNote.hasOwnProperty('id')) {
            return Notes.save($scope.currentNote).then(function() {
                // Refresh from DB to ensure side list is updated
                $scope.selectNote($scope.currentNote.id);
            });
        // If it's a brand new note (not yet in DB), add to database
        } else {
            return Notes.add($scope.currentNote).then(function(res) {
                $scope.currentNote = res.data;
                $scope.noteData.push($scope.currentNote);
                updateList(false);
            });
        }
    };

    // Delete selected note
    $scope.deleteNote = function() {
        // If default new note is loaded (not in DB), skip
        if (!$scope.currentNote.id) return;

        // Move note to Trash (if not already)
        if ($scope.currentNote.tags != 'Trash') {
            $scope.currentNote.tags = 'Trash';
            // save in Trash then make a new one
            $scope.saveNote().then($scope.addNote);
        // If already in Trash, ask if user would like to delete from database
        } else {
            var id = $scope.currentNote.id;
            deleteDialog('delete-popup', function() {
                Notes.delete(id).then(function() {
                    var noteIndex = $scope.noteData.findIndex(function(item) {
                        item.id == id;
                    })
                    $scope.noteData.splice(noteIndex, 1);
                    updateList(false);
                });
                // create a fresh new note
                $scope.addNote();
            });
        }
        $scope.message = 'Note deleted';
    };

    // Update order of notes on drop after dragging
    $scope.updateOrder = function(elem, y) {
        var defer = $q.defer();

        // Get notes with same tag and sort by current location
        var matchingNotes = $scope.noteTitleList.filter(function(n) {
            return n.tag == elem.tag;
        }).sort(function(a, b) {
            var elA = document.getElementById(a.id);
            var elB = document.getElementById(b.id);
            return elA.getBoundingClientRect().top - elB.getBoundingClientRect().top;
        });

        // Ensure indexes are consecutive, 0 through [number of notes]
        for (var i=0; i < matchingNotes.length; i++) {
            matchingNotes[i].index = i;
        }

        // Save each note, then update list when complete
        var promises = matchingNotes.map(function(note) {
            return Notes.get(note.id).then(function(res) {
                        res.data.sort_index = note.index;
                        return Notes.save(res.data);
                    });
        });
        $q.all(promises).then(function() {
            updateList(true); // update list with serer refresh
        });
    };

    // Update with message
    $scope.postMessage = function(text) {
        console.log(text);
    };

    // On initial run, load the list of user's notes and set up event listeners (for modal and menu handing)
    updateList(true).then($scope.addNote);
    eventListenerSetup();

    // Set up tinyMCE editor controls
    $scope.tinymceModel = '';
    $scope.tinymceOptions = {
        theme: 'modern',
        resize: true,
        height: '350px',
        background: 'white',

        plugins: [
          'advlist autolink link lists charmap preview hr anchor pagebreak',
          'searchreplace wordcount visualchars code fullscreen insertdatetime nonbreaking emoticons template paste textcolor save'
        ],

        toolbar: 'save undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | forecolor backcolor emoticons',

        // Call save function when editor's Save button is clicked
        save_onsavecallback: function() { $scope.saveNote(); },

        // allow users to save even when no changes have been made in tinyMCE editor (since title might've been changed)
        save_enablewhendirty: false,

        // Match up styling with the rest of page
        content_css: stylesheetPath,

        setup: function (ed) {
            ed.on('init', function(e) {
                tinymce.activeEditor.contentDocument.body.style.backgroundColor = '#fff';
            });
        }
    };
});


app.directive('ngDraggable', function($document) {
    return {
        require: 'mainController',
        restrict: 'A',
        scope: {
            dragOptions: '=ngDraggable'
        },
        controller: function($scope, $element) {
            var startX, startY, y = 0,
                    start, stop, drag, container, timePressed,
                    delay = 500;

            var width  = $element[0].offsetWidth,
                height = $element[0].offsetHeight;

            // Obtain drag options
            if ($scope.dragOptions) {
                start  = $scope.dragOptions.start;
                drag   = $scope.dragOptions.drag;
                stop   = $scope.dragOptions.stop;
                var id = $scope.dragOptions.container;
                if (id) {
                    container = document.getElementById(id).getBoundingClientRect();
                }
            }

            // Bind mousedown event
            $element.on('mousedown', function(e) {
                // If a tag was dragged, return to original location
                // TODO: allow tags to be moved
                var elem = $scope.$parent.listItem;
                if (elem.id.split(':')[0] == 'tag-click') {
                    return;
                }

                timePressed = Date.now();
                e.preventDefault();
                startX = e.clientX - $element[0].offsetLeft;
                startY = e.clientY - $element[0].offsetTop;
                y = e.clientY;
                $document.on('mousemove', mousemove);
                $document.on('mouseup', mouseup);
                if (start) start(e);
            });

            // Handle drag event
            function mousemove(e) {
                if (Date.now() - timePressed < delay) return;
                y = e.clientY - startY;
                setPosition();
                if (drag) drag(e);
            }

            // Unbind drag events
            function mouseup(e) {
                $document.unbind('mousemove', mousemove);
                $document.unbind('mouseup', mouseup);
                if (stop) stop(e);

                // If has been held down long enough, move it
                if (Date.now() - timePressed >= delay) {
                    $scope.$parent.$parent.updateOrder($scope.$parent.listItem, y);
                }
            }

            // Move element, within container if provided
            function setPosition() {
                if (container) {
                    if (y < container.top) {
                        y = container.top;
                    } else if (y > container.bottom - height) {
                        y = container.bottom - height;
                    }
                }

                $element.css({
                    position: 'absolute',
                    top: y + 'px',
                });
            }
        }
    }
});


updateNoteList = function($scope, data) {
    // Sort by tag
    data.sort(function(a, b) {
        if (a.tags == 'Trash') return 1;    // Put Trash tag at bottom
        if (b.tags == 'Trash') return -1;

        // If no tags, just compare alphbetically
        if (a.tags == null && b.tags == null) {
            return a.sort_index < b.sort_index ? -1 : 1;
        } else if (a.tags == null) {
            return 1;
        } else if (b.tags == null) {
            return -1;
        // Both items have tags
        } else if (a.tags == b.tags) {
            return a.sort_index < b.sort_index ? -1 : 1;
        } else {  // Each has different tags
            return a.tags.toUpperCase() < b.tags.toUpperCase() ? -1 : 1;
        }
    });

    // Display titles of notes with expanded tags or no tags, as well as any tag names
    $scope.noteTitleList = [];
    for (var i=0; i < data.length; i++) {
        if (!data[i].tags) { // doesn't have tag: always display
            $scope.noteTitleList.push({ title: data[i].note_title,
                                        id: data[i].id,
                                        index: data[i].sort_index,
                                        type: 'untagged-note',
                                        tag: '' });
        } else { // does have tag: display if expanded
            var expanded = $scope.expandedTagList.indexOf(data[i].tags) > -1;
            // add tag name if not already in list
            if (i == 0 || data[i].tags != data[i-1].tags) {
                $scope.noteTitleList.push({ title: data[i].tags,
                                            id: 'tag-click:' + data[i].tags,
                                            type: 'tag',
                                            isExpanded: expanded });
            }
            // add note title if it's in an expanded tag
            if (expanded) {
                $scope.noteTitleList.push({ title: data[i].note_title,
                                            id: data[i].id,
                                            index: data[i].sort_index,
                                            type: 'tagged-note',
                                            tag: data[i].tags });
            }
        }
    }
};
