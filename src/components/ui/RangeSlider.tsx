import { joinClasses } from './classNames'
import { SPECTRUM_STEPS, snapSpectrum } from '../../agent/communicationPreferences'

export interface RangeSliderProps {
  minLabel: string
  maxLabel: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}

export function RangeSlider({
  minLabel,
  maxLabel,
  value,
  onChange,
  disabled = false,
  className,
}: RangeSliderProps) {
  const snappedValue = snapSpectrum(value)

  const setFromClientX = (clientX: number, track: HTMLElement) => {
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onChange(snapSpectrum(ratio * 100))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const currentIndex = SPECTRUM_STEPS.findIndex(step => step === snappedValue)
    if (currentIndex === -1) return

    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(SPECTRUM_STEPS[Math.min(SPECTRUM_STEPS.length - 1, currentIndex + 1)])
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(SPECTRUM_STEPS[Math.max(0, currentIndex - 1)])
    }
  }

  return (
    <div className={joinClasses('ui-range-slider', className)}>
      <div className="ui-range-slider-labels">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
      <div className="ui-range-slider-zone">
        <div
          className="ui-range-slider-track"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={snappedValue}
          aria-label={`${minLabel} to ${maxLabel}`}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleKeyDown}
          onClick={event => {
            if (disabled) return
            setFromClientX(event.clientX, event.currentTarget)
          }}
        >
          <div className="ui-range-slider-track-line" aria-hidden="true" />
          <div
            className={joinClasses(
              'ui-range-slider-thumb',
              snappedValue === 0 && 'ui-range-slider-thumb--start',
              snappedValue === 100 && 'ui-range-slider-thumb--end',
            )}
            style={{ left: `${snappedValue}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="ui-range-slider-ticks" aria-hidden="true">
          {SPECTRUM_STEPS.map((step, index) => (
            <button
              key={step}
              type="button"
              disabled={disabled}
              className={joinClasses(
                'ui-range-slider-tick',
                index === 0 && 'ui-range-slider-tick--start',
                index === SPECTRUM_STEPS.length - 1 && 'ui-range-slider-tick--end',
                index === 2 && 'ui-range-slider-tick--center',
                snappedValue === step && 'ui-range-slider-tick--active',
              )}
              style={{ left: `${step}%` }}
              onClick={() => onChange(step)}
              tabIndex={-1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
