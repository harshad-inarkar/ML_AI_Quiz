import json
import random

def reshuffle_quiz(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        quiz_data = json.load(f)
        
    for question in quiz_data:
        # Get the actual string of the correct answer before shuffling
        correct_answer_text = question['options'][question['answer']]
        
        # Shuffle the options in place
        random.shuffle(question['options'])
        
        # Find the new index of the correct answer and update it
        question['answer'] = question['options'].index(correct_answer_text)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(quiz_data, f, indent=4)

# Usage:
# reshuffle_quiz('input_rnn_attention_quiz_7.json', 're_input_rnn_attention_quiz_7.json')