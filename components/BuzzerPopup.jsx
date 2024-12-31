import { useTranslation } from 'react-i18next';
import { useEffect, useState, useRef } from 'react';

const BuzzerPopup = ({ buzzed }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const firstPressRef = useRef(false);
  const isInitialMount = useRef(true);

  useEffect(() => {
    let timer;
    
    // Skip audio and animation if this is the initial mount with existing buzzer state
    // If we don't, on refresh this will cause errors due to needing user interaction on audio autoplay
    if (isInitialMount.current && buzzed?.id) {
      isInitialMount.current = false;
      firstPressRef.current = true;
      setIsVisible(false);
      return;
    }
    
    // Check if this is a new buzzer press (buzzed has an id and we haven't processed it yet)
    if (buzzed?.id && !firstPressRef.current) {
      // Set first press flag
      firstPressRef.current = true;
      
      // Sound Attribution:
      // "Quiz Show Buzzer 2" by JapanYoshiTheGamer
      // Source: https://freesound.org/s/423219/
      // License: Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/)
      const audio = new Audio('buzzer.wav');
      
      // Handle audio play errors gracefully
      // If we don't, popup will not go away
      audio.play().catch(error => {
        console.warn('Error playing buzzer sound:', error);
      });

      setIsVisible(true);
      timer = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    }

    // Reset the first press tracking when buzzed is cleared
    if (!buzzed || !buzzed.id) {
      firstPressRef.current = false;
      isInitialMount.current = false;
      setIsVisible(false);
      if (timer) {
        clearTimeout(timer);
      }
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [buzzed]);

  // Only show popup for valid buzzer press
  if (!buzzed?.id) {
    return null;
  }

  return (
    // TODO: Figure out why this isn't getting bigger
    <div className={`fixed inset-0 flex items-center justify-center z-50`}>
      <div
        className={`bg-black border-warning-500 border-4 rounded-lg transform transition-all duration-300
          ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="flex flex-col items-center p-8 text-warning-500">
          <div className="text-4xl font-bold">{t('First Buzzer')}</div>
          <hr className='w-full my-2 border-t-2 border-warning-500'/>
          <div className="text-2xl w-full text-center">
            <span className="font-semibold">{buzzed.name}</span>
            {typeof buzzed.team !== 'undefined' && <span className="ml-2">| {buzzed.team}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuzzerPopup;
