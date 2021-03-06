from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Note


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'first_name', 'last_name')

class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ('id', 'note_title', 'sort_index', 'note_text', 'tags', 'modified_date')
